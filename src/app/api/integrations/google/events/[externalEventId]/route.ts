import { NextRequest, NextResponse } from "next/server";
import {
  deleteGoogleCalendarEvent,
  GoogleApiError,
  type GoogleCalendarEvent,
  type GoogleUpdateCalendarEventInput,
  updateGoogleCalendarEvent,
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
};

type ExternalCalendarEventRow = {
  id: string;
  user_id: string;
  integration_id: string;
  provider_event_id: string;
  calendar_id: string;
};

type UpdateEventPayload = {
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
  sendUpdates?: "all" | "externalOnly" | "none";
};

class ApiRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function normalizeDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeAllDayDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
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

function mapGoogleEventToUpdate(event: GoogleCalendarEvent) {
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

function getReadableEventMutationErrorMessage(error: unknown): string {
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
        ? `Google ha rifiutato la modifica evento (403): ${detailed}. Riconnetti Google da Impostazioni per aggiornare i permessi.`
        : "Google ha rifiutato la modifica evento (403). Riconnetti Google da Impostazioni per aggiornare i permessi.";
    }
    if (error.status === 401) {
      return detailed
        ? `Google authorization failed (401): ${detailed}. Reconnect the integration.`
        : "Google authorization failed (401). Reconnect the integration.";
    }
    return detailed ? `${error.message} ${detailed}` : error.message;
  }
  return error instanceof Error ? error.message : "Operazione evento fallita.";
}

function buildGooglePatchPayload(payload: UpdateEventPayload): {
  event: GoogleUpdateCalendarEventInput;
  sendUpdates: "all" | "externalOnly" | "none";
} {
  const event: GoogleUpdateCalendarEventInput = {};
  const timeZone =
    payload.timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome";

  if (payload.title !== undefined) {
    const title = payload.title.trim();
    if (!title) throw new ApiRouteError("Titolo evento obbligatorio.", 400);
    event.summary = title;
  }

  if (payload.description !== undefined) {
    event.description = payload.description.trim();
  }
  if (payload.location !== undefined) {
    event.location = payload.location.trim();
  }

  if (Array.isArray(payload.attendeeEmails)) {
    const attendees = parseEmailList(payload.attendeeEmails);
    event.attendees = attendees.map((email) => ({ email }));
  }

  if (payload.isAllDay === true) {
    const startDate = payload.startDate?.trim();
    const endDate = payload.endDate?.trim() || startDate;
    if (!startDate || !endDate) {
      throw new ApiRouteError(
        "Data inizio/fine obbligatoria per evento giornaliero.",
        400
      );
    }
    if (endDate < startDate) {
      throw new ApiRouteError(
        "La data fine non può essere prima della data inizio.",
        400
      );
    }
    event.start = {
      date: dateOnly(startDate),
      timeZone,
    };
    event.end = {
      date: addDaysToDateOnly(endDate, 1),
      timeZone,
    };
  } else if (payload.isAllDay === false) {
    const startDateTime = toIsoDateTime(payload.startDateTime);
    const endDateTime = toIsoDateTime(payload.endDateTime);
    if (!startDateTime || !endDateTime) {
      throw new ApiRouteError("Data/ora inizio e fine obbligatorie.", 400);
    }
    if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
      throw new ApiRouteError(
        "L'orario di fine deve essere successivo all'inizio.",
        400
      );
    }
    event.start = {
      dateTime: startDateTime,
      timeZone,
    };
    event.end = {
      dateTime: endDateTime,
      timeZone,
    };
  }

  if (Object.keys(event).length === 0) {
    throw new ApiRouteError("Nessun campo da aggiornare.", 400);
  }

  return {
    event,
    sendUpdates: payload.sendUpdates ?? "all",
  };
}

async function loadEventAndIntegration(
  externalEventId: string,
  userId: string
): Promise<{
  eventRow: ExternalCalendarEventRow;
  integrationRow: CalendarIntegrationRow;
}> {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: eventData, error: eventError } = await supabaseAdmin
    .from("external_calendar_events")
    .select("id,user_id,integration_id,provider_event_id,calendar_id")
    .eq("id", externalEventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (eventError) {
    throw new ApiRouteError(eventError.message, 500);
  }
  if (!eventData) {
    throw new ApiRouteError("Evento non trovato.", 404);
  }
  const eventRow = eventData as ExternalCalendarEventRow;

  const { data: integrationData, error: integrationError } = await supabaseAdmin
    .from("calendar_integrations")
    .select(
      "id,user_id,calendar_id,access_token,refresh_token,token_expires_at,token_scope"
    )
    .eq("id", eventRow.integration_id)
    .eq("user_id", userId)
    .eq("provider", "GOOGLE")
    .maybeSingle();

  if (integrationError) {
    throw new ApiRouteError(integrationError.message, 500);
  }
  if (!integrationData) {
    throw new ApiRouteError("Google integration not connected.", 404);
  }

  return {
    eventRow,
    integrationRow: decryptIntegrationTokens(integrationData as CalendarIntegrationRow),
  };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ externalEventId: string }> }
) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const payload = (await request.json()) as UpdateEventPayload;
    const { externalEventId: rawExternalEventId } = await context.params;
    const externalEventId = rawExternalEventId?.trim();
    if (!externalEventId) {
      return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { eventRow, integrationRow } = await loadEventAndIntegration(
      externalEventId,
      user.id
    );

    const patchOptions = buildGooglePatchPayload(payload);

    let tokenState = await ensureValidAccessToken(integrationRow, false);
    if (
      tokenState.accessToken !== integrationRow.access_token ||
      tokenState.tokenExpiresAt !== integrationRow.token_expires_at ||
      tokenState.tokenScope !== integrationRow.token_scope
    ) {
      await persistIntegrationTokens(integrationRow.id, tokenState);
    }

    let updatedGoogleEvent: GoogleCalendarEvent;
    try {
      updatedGoogleEvent = await updateGoogleCalendarEvent({
        accessToken: tokenState.accessToken,
        calendarId: eventRow.calendar_id || integrationRow.calendar_id || "primary",
        eventId: eventRow.provider_event_id,
        event: patchOptions.event,
        sendUpdates: patchOptions.sendUpdates,
      });
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        error.status === 401 &&
        integrationRow.refresh_token
      ) {
        tokenState = await ensureValidAccessToken(integrationRow, true);
        await persistIntegrationTokens(integrationRow.id, tokenState);
        updatedGoogleEvent = await updateGoogleCalendarEvent({
          accessToken: tokenState.accessToken,
          calendarId: eventRow.calendar_id || integrationRow.calendar_id || "primary",
          eventId: eventRow.provider_event_id,
          event: patchOptions.event,
          sendUpdates: patchOptions.sendUpdates,
        });
      } else {
        throw error;
      }
    }

    const updatePayload = mapGoogleEventToUpdate(updatedGoogleEvent);
    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from("external_calendar_events")
      .update(updatePayload)
      .eq("id", eventRow.id)
      .eq("user_id", user.id)
      .select("id,title,description,starts_at,ends_at,is_all_day,meeting_url,status,attendees")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("calendar_integrations")
      .update({
        connection_status: "ACTIVE",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationRow.id);

    return NextResponse.json({ ok: true, event: updatedEvent });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ApiRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof GoogleApiError) {
      const message = getReadableEventMutationErrorMessage(error);
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return NextResponse.json({ error: message }, { status });
    }
    const message = getReadableEventMutationErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ externalEventId: string }> }
) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const { externalEventId: rawExternalEventId } = await context.params;
    const externalEventId = rawExternalEventId?.trim();
    if (!externalEventId) {
      return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const { eventRow, integrationRow } = await loadEventAndIntegration(
      externalEventId,
      user.id
    );

    let tokenState = await ensureValidAccessToken(integrationRow, false);
    if (
      tokenState.accessToken !== integrationRow.access_token ||
      tokenState.tokenExpiresAt !== integrationRow.token_expires_at ||
      tokenState.tokenScope !== integrationRow.token_scope
    ) {
      await persistIntegrationTokens(integrationRow.id, tokenState);
    }

    try {
      await deleteGoogleCalendarEvent({
        accessToken: tokenState.accessToken,
        calendarId: eventRow.calendar_id || integrationRow.calendar_id || "primary",
        eventId: eventRow.provider_event_id,
        sendUpdates: "all",
      });
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        error.status === 401 &&
        integrationRow.refresh_token
      ) {
        tokenState = await ensureValidAccessToken(integrationRow, true);
        await persistIntegrationTokens(integrationRow.id, tokenState);
        await deleteGoogleCalendarEvent({
          accessToken: tokenState.accessToken,
          calendarId: eventRow.calendar_id || integrationRow.calendar_id || "primary",
          eventId: eventRow.provider_event_id,
          sendUpdates: "all",
        });
      } else if (
        error instanceof GoogleApiError &&
        (error.status === 404 || error.status === 410)
      ) {
        // Event already deleted remotely: continue and mark local row as cancelled.
      } else {
        throw error;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("external_calendar_events")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventRow.id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("calendar_integrations")
      .update({
        connection_status: "ACTIVE",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationRow.id);

    return NextResponse.json({ ok: true, deletedId: eventRow.id });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ApiRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof GoogleApiError) {
      const message = getReadableEventMutationErrorMessage(error);
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return NextResponse.json({ error: message }, { status });
    }
    const message = getReadableEventMutationErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
