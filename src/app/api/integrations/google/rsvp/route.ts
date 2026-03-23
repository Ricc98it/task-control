import { NextRequest, NextResponse } from "next/server";
import {
  GoogleApiError,
  type GoogleCalendarEvent,
  type GoogleCalendarResponseStatus,
  updateGoogleCalendarEventResponseStatus,
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
  provider_account_email: string | null;
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
  attendees: unknown;
};

function getReadableRsvpErrorMessage(error: unknown): string {
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
        ? `Google ha rifiutato l'RSVP (403): ${detailed}. Riconnetti Google dalla sezione Impostazioni per aggiornare i permessi.`
        : "Google ha rifiutato l'RSVP (403). Riconnetti Google dalla sezione Impostazioni per aggiornare i permessi.";
    }

    if (error.status === 401) {
      return detailed
        ? `Google authorization failed (401): ${detailed}. Reconnect the integration.`
        : "Google authorization failed (401). Reconnect the integration.";
    }

    return detailed ? `${error.message} ${detailed}` : error.message;
  }

  return error instanceof Error ? error.message : "Unable to update Google RSVP.";
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

function isValidResponseStatus(value: string): value is GoogleCalendarResponseStatus {
  return value === "accepted" || value === "tentative" || value === "declined";
}

function extractSelfAttendeeEmail(attendees: unknown): string | null {
  if (!Array.isArray(attendees)) return null;
  for (const raw of attendees) {
    if (!raw || typeof raw !== "object") continue;
    const attendee = raw as { self?: unknown; email?: unknown };
    if (attendee.self === true && typeof attendee.email === "string") {
      return attendee.email;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserFromAuthorizationHeader(
      request.headers.get("authorization")
    );
    const supabaseAdmin = getSupabaseAdminClient();
    const body = (await request.json()) as {
      externalEventId?: string;
      responseStatus?: string;
    };

    const externalEventId = body.externalEventId?.trim();
    const responseStatus = body.responseStatus?.trim() ?? "";
    if (!externalEventId || !isValidResponseStatus(responseStatus)) {
      return NextResponse.json(
        { error: "Invalid RSVP payload." },
        { status: 400 }
      );
    }

    const { data: eventData, error: eventError } = await supabaseAdmin
      .from("external_calendar_events")
      .select("id,user_id,integration_id,provider_event_id,calendar_id,attendees")
      .eq("id", externalEventId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }
    if (!eventData) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const eventRow = eventData as ExternalCalendarEventRow;

    const { data: integrationData, error: integrationError } = await supabaseAdmin
      .from("calendar_integrations")
      .select(
        "id,user_id,calendar_id,provider_account_email,access_token,refresh_token,token_expires_at,token_scope"
      )
      .eq("id", eventRow.integration_id)
      .eq("user_id", user.id)
      .eq("provider", "GOOGLE")
      .maybeSingle();

    if (integrationError) {
      return NextResponse.json({ error: integrationError.message }, { status: 500 });
    }
    if (!integrationData) {
      return NextResponse.json(
        { error: "Google integration not connected." },
        { status: 404 }
      );
    }
    const integration = decryptIntegrationTokens(integrationData as CalendarIntegrationRow);

    const attendeeEmail =
      extractSelfAttendeeEmail(eventRow.attendees) ?? integration.provider_account_email;
    if (!attendeeEmail) {
      return NextResponse.json(
        { error: "Unable to identify attendee email for RSVP." },
        { status: 400 }
      );
    }

    let tokenState = await ensureValidAccessToken(integration, false);
    if (
      tokenState.accessToken !== integration.access_token ||
      tokenState.tokenExpiresAt !== integration.token_expires_at ||
      tokenState.tokenScope !== integration.token_scope
    ) {
      await persistIntegrationTokens(integration.id, tokenState);
    }

    let updatedGoogleEvent: GoogleCalendarEvent;
    try {
      updatedGoogleEvent = await updateGoogleCalendarEventResponseStatus({
        accessToken: tokenState.accessToken,
        calendarId: eventRow.calendar_id || integration.calendar_id || "primary",
        eventId: eventRow.provider_event_id,
        attendeeEmail,
        responseStatus,
      });
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        error.status === 401 &&
        integration.refresh_token
      ) {
        tokenState = await ensureValidAccessToken(integration, true);
        await persistIntegrationTokens(integration.id, tokenState);
        updatedGoogleEvent = await updateGoogleCalendarEventResponseStatus({
          accessToken: tokenState.accessToken,
          calendarId: eventRow.calendar_id || integration.calendar_id || "primary",
          eventId: eventRow.provider_event_id,
          attendeeEmail,
          responseStatus,
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
      .eq("id", integration.id);

    return NextResponse.json({
      ok: true,
      event: updatedEvent,
    });
  } catch (error) {
    if (error instanceof ServerAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = getReadableRsvpErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
