import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  GoogleApiError,
  listGoogleCalendarEvents,
} from "@/lib/googleCalendar";
import {
  decryptIntegrationTokens,
  ensureValidAccessToken,
  persistIntegrationTokens,
} from "@/lib/googleTokens";
import {
  ServerAuthError,
  requireUserFromAuthorizationHeader,
} from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  extractGoogleApiErrorDetail,
  mapGoogleEventToExternalEventRow,
} from "@/app/api/integrations/google/utils";

type CalendarIntegrationRow = {
  id: string;
  user_id: string;
  calendar_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  token_scope: string | null;
  sync_token: string | null;
  connection_status: string;
};

function getReadableSyncErrorMessage(error: unknown): string {
  if (error instanceof GoogleApiError) {
    const detailed = extractGoogleApiErrorDetail(error);

    if (error.status === 401) {
      return detailed
        ? `Google authorization failed (401): ${detailed}. Reconnect the integration.`
        : "Google authorization failed (401). Reconnect the integration.";
    }

    return detailed ? `${error.message} ${detailed}` : error.message;
  }

  return error instanceof Error ? error.message : "Google calendar sync failed.";
}

function getDefaultSyncWindow() {
  const now = new Date();
  const min = new Date(now);
  min.setDate(min.getDate() - 30);

  const max = new Date(now);
  max.setDate(max.getDate() + 365);

  return {
    timeMin: min.toISOString(),
    timeMax: max.toISOString(),
  };
}

async function runSync(options: {
  integration: CalendarIntegrationRow;
  forceFullSync: boolean;
}) {
  const supabaseAdmin = getSupabaseAdminClient();
  const tokenState = await ensureValidAccessToken(options.integration);

  if (
    tokenState.accessToken !== options.integration.access_token ||
    tokenState.tokenExpiresAt !== options.integration.token_expires_at ||
    tokenState.tokenScope !== options.integration.token_scope
  ) {
    await persistIntegrationTokens(options.integration.id, tokenState);
  }

  const integrationWithToken = {
    ...options.integration,
    access_token: tokenState.accessToken,
  };

  const { timeMin, timeMax } = getDefaultSyncWindow();

  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let fetchedCount = 0;
  let upsertedCount = 0;
  let cancelledCount = 0;
  const bufferedRows: Array<ReturnType<typeof mapGoogleEventToExternalEventRow>> = [];

  const flush = async () => {
    if (bufferedRows.length === 0) return;
    const payload = bufferedRows.splice(0, bufferedRows.length);
    const { error } = await supabaseAdmin
      .from("external_calendar_events")
      .upsert(payload, { onConflict: "integration_id,provider_event_id" });
    if (error) {
      throw new Error(error.message);
    }
    upsertedCount += payload.length;
  };

  do {
    const result = await listGoogleCalendarEvents({
      accessToken: integrationWithToken.access_token ?? "",
      calendarId: integrationWithToken.calendar_id || "primary",
      pageToken,
      syncToken:
        !options.forceFullSync && integrationWithToken.sync_token
          ? integrationWithToken.sync_token
          : undefined,
      timeMin:
        options.forceFullSync || !integrationWithToken.sync_token ? timeMin : undefined,
      timeMax:
        options.forceFullSync || !integrationWithToken.sync_token ? timeMax : undefined,
    });

    fetchedCount += result.items.length;
    for (const event of result.items) {
      if (event.status === "cancelled") {
        cancelledCount += 1;
      }
      if (!event.id) {
        continue;
      }
      bufferedRows.push(mapGoogleEventToExternalEventRow(event, integrationWithToken));
      if (bufferedRows.length >= 500) {
        await flush();
      }
    }

    pageToken = result.nextPageToken ?? undefined;
    if (result.nextSyncToken) {
      nextSyncToken = result.nextSyncToken;
    }
  } while (pageToken);

  await flush();

  await supabaseAdmin
    .from("calendar_integrations")
    .update({
      sync_token: nextSyncToken ?? integrationWithToken.sync_token,
      last_sync_at: new Date().toISOString(),
      last_sync_error: null,
      connection_status: "ACTIVE",
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationWithToken.id);

  return { fetchedCount, upsertedCount, cancelledCount };
}

async function runSyncBackground(
  integration: CalendarIntegrationRow,
  forceFullSync: boolean
): Promise<void> {
  const supabaseAdmin = getSupabaseAdminClient();

  const markError = async (error: unknown) => {
    const message = getReadableSyncErrorMessage(error);
    await supabaseAdmin
      .from("calendar_integrations")
      .update({
        connection_status: "ERROR",
        last_sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);
  };

  try {
    await runSync({ integration, forceFullSync });
    return;
  } catch (error) {
    // Sync token expired — retry as full sync
    if (
      error instanceof GoogleApiError &&
      error.status === 410 &&
      !forceFullSync &&
      integration.sync_token
    ) {
      try {
        await runSync({
          integration: { ...integration, sync_token: null },
          forceFullSync: true,
        });
        return;
      } catch (retryError) {
        await markError(retryError);
        return;
      }
    }

    // Access token rejected — force refresh and retry
    if (
      error instanceof GoogleApiError &&
      error.status === 401 &&
      integration.refresh_token
    ) {
      try {
        await runSync({
          integration: { ...integration, access_token: null, token_expires_at: null },
          forceFullSync,
        });
        return;
      } catch (retryError) {
        await markError(retryError);
        return;
      }
    }

    await markError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const supabaseAdmin = getSupabaseAdminClient();

    let forceFullSync = false;
    try {
      const body = (await request.json()) as { forceFullSync?: boolean };
      forceFullSync = Boolean(body.forceFullSync);
    } catch {
      forceFullSync = false;
    }

    const { data: integration, error } = await supabaseAdmin
      .from("calendar_integrations")
      .select(
        "id,user_id,calendar_id,access_token,refresh_token,token_expires_at,token_scope,sync_token,connection_status"
      )
      .eq("user_id", user.id)
      .eq("provider", "GOOGLE")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!integration) {
      return NextResponse.json(
        { error: "Google integration not connected." },
        { status: 404 }
      );
    }

    const integrationRow = decryptIntegrationTokens(integration as CalendarIntegrationRow);

    // If a sync is already running, return 202 without launching a second one
    if (integrationRow.connection_status === "SYNCING") {
      return NextResponse.json({ ok: true, syncing: true, alreadySyncing: true }, { status: 202 });
    }

    // Mark as syncing before responding
    await supabaseAdmin
      .from("calendar_integrations")
      .update({
        connection_status: "SYNCING",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationRow.id);

    // Launch sync in background — Vercel keeps the function alive until resolved
    waitUntil(runSyncBackground(integrationRow, forceFullSync));

    return NextResponse.json({ ok: true, syncing: true }, { status: 202 });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to sync Google Calendar events." },
      { status: 500 }
    );
  }
}
