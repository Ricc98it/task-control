import { NextRequest, NextResponse } from "next/server";
import {
  GoogleApiError,
  type GoogleCalendarEvent,
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

type CalendarIntegrationRow = {
  id: string;
  user_id: string;
  calendar_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  token_scope: string | null;
  sync_token: string | null;
};

function getReadableSyncErrorMessage(error: unknown): string {
  if (error instanceof GoogleApiError) {
    const body = error.body as
      | {
          error_description?: string;
          error?: string | { message?: string };
          message?: string;
        }
      | null;

    const detailed =
      body?.error_description ??
      (typeof body?.error === "string"
        ? body.error
        : body?.error?.message ?? body?.message ?? null);

    if (error.status === 401) {
      return detailed
        ? `Google authorization failed (401): ${detailed}. Reconnect the integration.`
        : "Google authorization failed (401). Reconnect the integration.";
    }

    return detailed ? `${error.message} ${detailed}` : error.message;
  }

  return error instanceof Error ? error.message : "Google calendar sync failed.";
}

function normalizeDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeAllDayDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video" && entry.uri
  );
  if (videoEntry?.uri) return videoEntry.uri;

  if (event.location) {
    const match = /(https?:\/\/meet\.google\.com\/[a-z0-9-]+)/i.exec(event.location);
    if (match?.[1]) return match[1];
  }

  return null;
}

function mapGoogleEventToRow(
  event: GoogleCalendarEvent,
  integration: CalendarIntegrationRow
) {
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const startsAt = isAllDay
    ? normalizeAllDayDate(event.start?.date)
    : normalizeDateTime(event.start?.dateTime);
  const endsAt = isAllDay
    ? normalizeAllDayDate(event.end?.date)
    : normalizeDateTime(event.end?.dateTime);

  const meetingUrl = extractMeetingUrl(event);
  const conferenceType = event.conferenceData?.conferenceSolution?.key?.type ?? null;

  const attendees = (event.attendees ?? []).map((attendee) => ({
    email: attendee.email ?? null,
    displayName: attendee.displayName ?? null,
    responseStatus: attendee.responseStatus ?? null,
    organizer: Boolean(attendee.organizer),
    optional: Boolean(attendee.optional),
    self: Boolean(attendee.self),
  }));

  return {
    user_id: integration.user_id,
    integration_id: integration.id,
    provider: "GOOGLE",
    provider_event_id: event.id,
    calendar_id: integration.calendar_id || "primary",
    status: event.status ?? "confirmed",
    title: event.summary ?? null,
    description: event.description ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: isAllDay,
    meeting_url: meetingUrl,
    meeting_provider: conferenceType,
    attendees,
    raw_payload: event,
    updated_at: new Date().toISOString(),
  };
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
  const bufferedRows: Array<ReturnType<typeof mapGoogleEventToRow>> = [];

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
      bufferedRows.push(mapGoogleEventToRow(event, integrationWithToken));
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

  return {
    fetchedCount,
    upsertedCount,
    cancelledCount,
    nextSyncToken: nextSyncToken ?? integrationWithToken.sync_token,
  };
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
        "id,user_id,calendar_id,access_token,refresh_token,token_expires_at,token_scope,sync_token"
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

    try {
      const result = await runSync({
        integration: integrationRow,
        forceFullSync,
      });
      return NextResponse.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        error.status === 410 &&
        !forceFullSync &&
        integrationRow.sync_token
      ) {
        const retryResult = await runSync({
          integration: {
            ...integrationRow,
            sync_token: null,
          },
          forceFullSync: true,
        });
        return NextResponse.json({
          ok: true,
          fullResyncTriggered: true,
          ...retryResult,
        });
      }

      let finalError: unknown = error;
      if (
        error instanceof GoogleApiError &&
        error.status === 401 &&
        integrationRow.refresh_token
      ) {
        try {
          const retryResult = await runSync({
            integration: {
              ...integrationRow,
              access_token: null,
              token_expires_at: null,
            },
            forceFullSync,
          });
          return NextResponse.json({
            ok: true,
            accessTokenRefreshed: true,
            ...retryResult,
          });
        } catch (retryError) {
          finalError = retryError;
        }
      }

      const message = getReadableSyncErrorMessage(finalError);
      await supabaseAdmin
        .from("calendar_integrations")
        .update({
          connection_status: "ERROR",
          last_sync_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationRow.id);

      return NextResponse.json({ error: message }, { status: 500 });
    }
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
