import { NextRequest, NextResponse } from "next/server";
import {
  GoogleApiError,
  type GoogleCalendarEvent,
  type GoogleCreateCalendarEventInput,
  createGoogleCalendarEvent,
  refreshGoogleAccessToken,
} from "@/lib/googleCalendar";
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
};

type CreateEventPayload = {
  title?: string;
  description?: string;
  location?: string;
  isAllDay?: boolean;
  startDate?: string;
  endDate?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  attendeeEmails?: string[];
  addGoogleMeet?: boolean;
  visibility?: "default" | "public" | "private" | "confidential";
  availability?: "busy" | "free";
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  sendUpdates?: "all" | "externalOnly" | "none";
  reminderMinutes?: number[];
  useDefaultReminders?: boolean;
  recurrenceRule?: string;
  colorId?: string;
};

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

function parseEmailList(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<string>();
  for (const item of input) {
    const normalized = item.trim().toLowerCase();
    if (!normalized) continue;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      set.add(normalized);
    }
  }
  return Array.from(set);
}

function parseReminderMinutes(input?: number[]): number[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<number>();
  for (const value of input) {
    const minutes = Number(value);
    if (!Number.isInteger(minutes)) continue;
    if (minutes < 0 || minutes > 40320) continue;
    set.add(minutes);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function addDaysToDateOnly(value: string, days: number): string {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function getReadableEventCreateErrorMessage(error: unknown): string {
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

    if (error.status === 403) {
      return detailed
        ? `Google ha rifiutato la creazione evento (403): ${detailed}. Riconnetti Google da Impostazioni per aggiornare i permessi.`
        : "Google ha rifiutato la creazione evento (403). Riconnetti Google da Impostazioni per aggiornare i permessi.";
    }
    if (error.status === 401) {
      return detailed
        ? `Google authorization failed (401): ${detailed}. Reconnect the integration.`
        : "Google authorization failed (401). Reconnect the integration.";
    }
    return detailed ? `${error.message} ${detailed}` : error.message;
  }
  return error instanceof Error ? error.message : "Creazione evento fallita.";
}

async function ensureValidAccessToken(
  integration: CalendarIntegrationRow,
  forceRefresh = false
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
    forceRefresh ||
    !integration.access_token ||
    !expiresAtMs ||
    expiresAtMs <= Date.now() + 60_000;

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

function buildGoogleCreatePayload(payload: CreateEventPayload): {
  event: GoogleCreateCalendarEventInput;
  sendUpdates: "all" | "externalOnly" | "none";
  conferenceDataVersion: 0 | 1;
} {
  const title = payload.title?.trim();
  if (!title) {
    throw new Error("Titolo evento obbligatorio.");
  }

  const isAllDay = payload.isAllDay === true;
  const timeZone =
    payload.timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome";
  const attendees = parseEmailList(payload.attendeeEmails);
  const reminderMinutes = parseReminderMinutes(payload.reminderMinutes);
  const transparency: "opaque" | "transparent" =
    payload.availability === "free" ? "transparent" : "opaque";
  const visibility: "default" | "public" | "private" | "confidential" =
    payload.visibility ?? "default";

  let start: { date?: string; dateTime?: string; timeZone?: string };
  let end: { date?: string; dateTime?: string; timeZone?: string };

  if (isAllDay) {
    const startDate = payload.startDate?.trim();
    const endDate = payload.endDate?.trim() || startDate;
    if (!startDate || !endDate) {
      throw new Error("Data inizio/fine obbligatoria per evento giornaliero.");
    }
    if (endDate < startDate) {
      throw new Error("La data fine non può essere prima della data inizio.");
    }
    start = {
      date: dateOnly(startDate),
      timeZone,
    };
    end = {
      date: addDaysToDateOnly(endDate, 1),
      timeZone,
    };
  } else {
    const startDateTime = toIsoDateTime(payload.startDateTime);
    const endDateTime = toIsoDateTime(payload.endDateTime);
    if (!startDateTime || !endDateTime) {
      throw new Error("Data/ora inizio e fine obbligatorie.");
    }
    if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
      throw new Error("L'orario di fine deve essere successivo all'inizio.");
    }
    start = {
      dateTime: startDateTime,
      timeZone,
    };
    end = {
      dateTime: endDateTime,
      timeZone,
    };
  }

  return {
    event: {
      summary: title,
      description: payload.description?.trim() || undefined,
      location: payload.location?.trim() || undefined,
      start,
      end,
      attendees: attendees.map((email) => ({ email })),
      transparency,
      visibility,
      guestsCanInviteOthers: payload.guestsCanInviteOthers ?? true,
      guestsCanModify: payload.guestsCanModify ?? false,
      guestsCanSeeOtherGuests: payload.guestsCanSeeOtherGuests ?? true,
      recurrence: payload.recurrenceRule?.trim()
        ? [`RRULE:${payload.recurrenceRule.trim().replace(/^RRULE:/i, "")}`]
        : undefined,
      colorId: payload.colorId?.trim() || undefined,
      reminders:
        payload.useDefaultReminders === false
          ? {
              useDefault: false,
              overrides: reminderMinutes.map((minutes) => ({
                method: "popup" as const,
                minutes,
              })),
            }
          : {
              useDefault: true,
            },
      conferenceData: payload.addGoogleMeet
        ? {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: {
                type: "hangoutsMeet" as const,
              },
            },
          }
        : undefined,
    },
    sendUpdates: payload.sendUpdates ?? "all",
    conferenceDataVersion: payload.addGoogleMeet ? (1 as const) : (0 as const),
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const payload = (await request.json()) as CreateEventPayload;
    const supabaseAdmin = getSupabaseAdminClient();

    const { data: integration, error } = await supabaseAdmin
      .from("calendar_integrations")
      .select(
        "id,user_id,calendar_id,access_token,refresh_token,token_expires_at,token_scope"
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

    const integrationRow = integration as CalendarIntegrationRow;
    const createOptions = buildGoogleCreatePayload(payload);

    let tokenState = await ensureValidAccessToken(integrationRow, false);
    if (
      tokenState.accessToken !== integrationRow.access_token ||
      tokenState.tokenExpiresAt !== integrationRow.token_expires_at ||
      tokenState.tokenScope !== integrationRow.token_scope
    ) {
      await persistIntegrationTokens(integrationRow.id, tokenState);
    }

    let createdGoogleEvent: GoogleCalendarEvent;
    try {
      createdGoogleEvent = await createGoogleCalendarEvent({
        accessToken: tokenState.accessToken,
        calendarId: integrationRow.calendar_id || "primary",
        event: createOptions.event,
        sendUpdates: createOptions.sendUpdates,
        conferenceDataVersion: createOptions.conferenceDataVersion,
      });
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        error.status === 401 &&
        integrationRow.refresh_token
      ) {
        tokenState = await ensureValidAccessToken(integrationRow, true);
        await persistIntegrationTokens(integrationRow.id, tokenState);
        createdGoogleEvent = await createGoogleCalendarEvent({
          accessToken: tokenState.accessToken,
          calendarId: integrationRow.calendar_id || "primary",
          event: createOptions.event,
          sendUpdates: createOptions.sendUpdates,
          conferenceDataVersion: createOptions.conferenceDataVersion,
        });
      } else {
        throw error;
      }
    }

    if (!createdGoogleEvent.id) {
      throw new Error("Google non ha restituito un ID evento valido.");
    }

    const upsertPayload = mapGoogleEventToRow(createdGoogleEvent, integrationRow);
    const { data: savedEvent, error: saveError } = await supabaseAdmin
      .from("external_calendar_events")
      .upsert(upsertPayload, { onConflict: "integration_id,provider_event_id" })
      .select("id,title,description,starts_at,ends_at,is_all_day,meeting_url,status,attendees")
      .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("calendar_integrations")
      .update({
        connection_status: "ACTIVE",
        last_sync_error: null,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationRow.id);

    return NextResponse.json({ ok: true, event: savedEvent });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = getReadableEventCreateErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
