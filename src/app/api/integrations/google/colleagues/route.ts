import { NextRequest, NextResponse } from "next/server";
import {
  GoogleApiError,
  type GoogleCalendarEvent,
  listGoogleCalendarEvents,
  refreshGoogleAccessToken,
  searchGoogleDirectoryPeople,
} from "@/lib/googleCalendar";
import {
  ServerAuthError,
  requireUserFromAuthorizationHeader,
} from "@/lib/serverAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type CalendarIntegrationRow = {
  id: string;
  user_id: string;
  provider_account_email: string | null;
  calendar_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  token_scope: string | null;
};

type ColleagueCalendarRow = {
  id: string;
  user_id: string;
  provider_account_email: string | null;
};

type ColleagueCalendarEvent = {
  id: string;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
  meeting_url: string | null;
  status: string;
  attendees: Array<{
    email?: string | null;
    displayName?: string | null;
    responseStatus?: string | null;
    organizer?: boolean;
    optional?: boolean;
    self?: boolean;
  }>;
  ownerEmail: string;
  readOnly: true;
};

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function parseEmailList(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<string>();
  for (const item of input) {
    const normalized = normalizeEmail(item ?? "");
    if (!normalized) continue;
    set.add(normalized);
  }
  return Array.from(set);
}

function getEmailDomain(value: string | null | undefined): string | null {
  const normalized = normalizeEmail(value ?? "");
  if (!normalized) return null;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
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

function mapGoogleEventToColleagueEvent(
  event: GoogleCalendarEvent,
  ownerEmail: string
): ColleagueCalendarEvent | null {
  if (!event.id) return null;
  const normalizedOwnerEmail = normalizeEmail(ownerEmail);
  if (!normalizedOwnerEmail) return null;

  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const startsAt = isAllDay
    ? normalizeAllDayDate(event.start?.date)
    : normalizeDateTime(event.start?.dateTime);
  const endsAt = isAllDay
    ? normalizeAllDayDate(event.end?.date)
    : normalizeDateTime(event.end?.dateTime);

  if (!startsAt) return null;

  return {
    id: `${normalizedOwnerEmail}::${event.id}`,
    title: event.summary ?? null,
    description: event.description ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: isAllDay,
    meeting_url: extractMeetingUrl(event),
    status: event.status ?? "confirmed",
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.email ?? null,
      displayName: attendee.displayName ?? null,
      responseStatus: attendee.responseStatus ?? null,
      organizer: Boolean(attendee.organizer),
      optional: Boolean(attendee.optional),
      self: Boolean(attendee.self),
    })),
    ownerEmail: normalizedOwnerEmail,
    readOnly: true,
  };
}

async function getAccessibleUserIds(userId: string): Promise<string[]> {
  const supabaseAdmin = getSupabaseAdminClient();
  const accessible = new Set<string>([userId]);
  const workspaceIds = new Set<string>();

  const [{ data: memberRows, error: memberError }, { data: ownedRows, error: ownedError }] =
    await Promise.all([
      supabaseAdmin
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId),
      supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", userId),
    ]);

  if (memberError && ownedError) {
    return Array.from(accessible);
  }

  for (const row of memberRows ?? []) {
    const workspaceId = (row as { workspace_id?: string }).workspace_id;
    if (workspaceId) workspaceIds.add(workspaceId);
  }
  for (const row of ownedRows ?? []) {
    const workspaceId = (row as { id?: string }).id;
    if (workspaceId) workspaceIds.add(workspaceId);
  }

  if (workspaceIds.size === 0) {
    return Array.from(accessible);
  }

  const allWorkspaceIds = Array.from(workspaceIds);
  const [{ data: allMembers }, { data: workspaceOwners }] = await Promise.all([
    supabaseAdmin
      .from("workspace_members")
      .select("user_id")
      .in("workspace_id", allWorkspaceIds),
    supabaseAdmin
      .from("workspaces")
      .select("owner_user_id")
      .in("id", allWorkspaceIds),
  ]);

  for (const row of allMembers ?? []) {
    const memberUserId = (row as { user_id?: string }).user_id;
    if (memberUserId) accessible.add(memberUserId);
  }
  for (const row of workspaceOwners ?? []) {
    const ownerUserId = (row as { owner_user_id?: string }).owner_user_id;
    if (ownerUserId) accessible.add(ownerUserId);
  }

  return Array.from(accessible);
}

async function loadUserGoogleIntegration(
  userId: string
): Promise<CalendarIntegrationRow | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("calendar_integrations")
    .select(
      "id,user_id,provider_account_email,calendar_id,access_token,refresh_token,token_expires_at,token_scope"
    )
    .eq("user_id", userId)
    .eq("provider", "GOOGLE")
    .maybeSingle();

  if (error || !data) return null;
  return data as CalendarIntegrationRow;
}

async function ensureValidAccessToken(
  integration: CalendarIntegrationRow
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  tokenScope: string | null;
}> {
  const expiresAtMs = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : 0;
  const isExpiredOrMissing =
    !integration.access_token || !expiresAtMs || expiresAtMs <= Date.now() + 60_000;

  if (!isExpiredOrMissing) {
    return {
      accessToken: integration.access_token!,
      refreshToken: integration.refresh_token,
      tokenExpiresAt: integration.token_expires_at,
      tokenScope: integration.token_scope,
    };
  }

  if (!integration.refresh_token) {
    throw new Error("Google refresh token mancante. Ricollega l'integrazione.");
  }

  const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt,
    tokenScope: refreshed.scope,
  };
}

async function persistIntegrationTokens(
  integrationId: string,
  tokenState: {
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: string | null;
    tokenScope: string | null;
  }
) {
  const supabaseAdmin = getSupabaseAdminClient();
  await supabaseAdmin
    .from("calendar_integrations")
    .update({
      access_token: tokenState.accessToken,
      refresh_token: tokenState.refreshToken,
      token_expires_at: tokenState.tokenExpiresAt,
      token_scope: tokenState.tokenScope,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);
}

async function loadFallbackColleagueEmails(
  userId: string,
  query: string
): Promise<{ emails: string[]; ownEmails: Set<string> }> {
  const supabaseAdmin = getSupabaseAdminClient();
  const accessibleUserIds = await getAccessibleUserIds(userId);

  const { data, error } = await supabaseAdmin
    .from("calendar_integrations")
    .select("id,user_id,provider_account_email")
    .eq("provider", "GOOGLE")
    .in("user_id", accessibleUserIds)
    .not("provider_account_email", "is", null);

  if (error) {
    return { emails: [], ownEmails: new Set<string>() };
  }

  const ownEmails = new Set<string>();
  const ownDomains = new Set<string>();
  const emailSet = new Set<string>();

  for (const row of (data ?? []) as ColleagueCalendarRow[]) {
    const email = normalizeEmail(row.provider_account_email ?? "");
    if (!email) continue;
    emailSet.add(email);
    if (row.user_id === userId) {
      ownEmails.add(email);
      const domain = getEmailDomain(email);
      if (domain) ownDomains.add(domain);
    }
  }

  if (ownDomains.size > 0) {
    const domainResponses = await Promise.all(
      Array.from(ownDomains).map((domain) =>
        supabaseAdmin
          .from("calendar_integrations")
          .select("id,user_id,provider_account_email")
          .eq("provider", "GOOGLE")
          .ilike("provider_account_email", `%@${domain}`)
          .not("provider_account_email", "is", null)
      )
    );

    for (const response of domainResponses) {
      for (const row of (response.data ?? []) as ColleagueCalendarRow[]) {
        const email = normalizeEmail(row.provider_account_email ?? "");
        if (!email) continue;
        if (row.user_id === userId) {
          ownEmails.add(email);
          continue;
        }
        emailSet.add(email);
      }
    }
  }

  const filtered = Array.from(emailSet)
    .filter((email) => !ownEmails.has(email))
    .filter((email) => email.includes(query))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 30);

  return { emails: filtered, ownEmails };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    if (!query) {
      return NextResponse.json({ emails: [] });
    }

    const fallback = await loadFallbackColleagueEmails(user.id, query);
    const emailSet = new Set<string>(fallback.emails);
    let warning: string | null = null;

    const integration = await loadUserGoogleIntegration(user.id);
    if (integration) {
      try {
        const tokenState = await ensureValidAccessToken(integration);
        if (
          tokenState.accessToken !== integration.access_token ||
          tokenState.tokenExpiresAt !== integration.token_expires_at ||
          tokenState.tokenScope !== integration.token_scope
        ) {
          await persistIntegrationTokens(integration.id, tokenState);
        }

        const directoryEmails = await searchGoogleDirectoryPeople({
          accessToken: tokenState.accessToken,
          query,
          pageSize: 40,
        });
        for (const email of directoryEmails) {
          if (fallback.ownEmails.has(email)) continue;
          if (!email.includes(query)) continue;
          emailSet.add(email);
        }
      } catch (error) {
        if (emailSet.size === 0) {
          if (error instanceof GoogleApiError && (error.status === 401 || error.status === 403)) {
            warning =
              "Permessi directory Google mancanti o non approvati. Ricollega Google e chiedi autorizzazione admin.";
          } else {
            warning = "Ricerca directory Google non disponibile al momento.";
          }
        }
      }
    }

    const emails = Array.from(emailSet)
      .filter((email) => !fallback.ownEmails.has(email))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 30);

    return NextResponse.json({ emails, warning });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to load colleague calendars." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const body = (await request.json()) as {
      emails?: string[];
      start?: string;
      end?: string;
    };

    const emails = parseEmailList(body.emails);
    const start = body.start ? new Date(body.start) : null;
    const end = body.end ? new Date(body.end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Intervallo date non valido." }, { status: 400 });
    }
    if (end.getTime() <= start.getTime()) {
      return NextResponse.json({ error: "Intervallo date non valido." }, { status: 400 });
    }
    if (emails.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const integration = await loadUserGoogleIntegration(user.id);
    if (!integration) {
      return NextResponse.json({ error: "Integrazione Google non trovata." }, { status: 404 });
    }

    const tokenState = await ensureValidAccessToken(integration);
    if (
      tokenState.accessToken !== integration.access_token ||
      tokenState.tokenExpiresAt !== integration.token_expires_at ||
      tokenState.tokenScope !== integration.token_scope
    ) {
      await persistIntegrationTokens(integration.id, tokenState);
    }

    const eventsById = new Map<string, ColleagueCalendarEvent>();
    const skippedEmails = new Set<string>();

    for (const email of emails) {
      let pageToken: string | undefined;
      try {
        do {
          const page = await listGoogleCalendarEvents({
            accessToken: tokenState.accessToken,
            calendarId: email,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            pageToken,
          });

          for (const event of page.items) {
            if (!event.id) continue;
            if (event.status === "cancelled") continue;
            const mapped = mapGoogleEventToColleagueEvent(event, email);
            if (!mapped) continue;
            eventsById.set(mapped.id, mapped);
          }

          pageToken = page.nextPageToken ?? undefined;
        } while (pageToken);
      } catch (error) {
        if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) {
          skippedEmails.add(email);
          continue;
        }
        skippedEmails.add(email);
      }
    }

    const events = Array.from(eventsById.values()).sort((a, b) => {
      const left = new Date(a.starts_at ?? 0).getTime();
      const right = new Date(b.starts_at ?? 0).getTime();
      return left - right;
    });

    const warning =
      skippedEmails.size > 0
        ? `Calendari non accessibili: ${Array.from(skippedEmails)
            .slice(0, 4)
            .join(", ")}${skippedEmails.size > 4 ? "..." : ""}`
        : null;

    return NextResponse.json({
      events,
      skippedEmails: Array.from(skippedEmails),
      warning,
    });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Unable to load colleague events." },
      { status: 500 }
    );
  }
}
