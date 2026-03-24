import { NextRequest, NextResponse } from "next/server";
import {
  GoogleApiError,
  type GoogleCalendarEvent,
  type GoogleCreateCalendarEventInput,
  createGoogleCalendarEvent,
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
  ApiRouteError,
  addDaysToDateOnly,
  dateOnly,
  extractGoogleApiErrorDetail,
  mapGoogleEventToExternalEventRow,
  parseEmailList,
  toGoogleApiStatus,
  toIsoDateTime,
} from "@/app/api/integrations/google/utils";

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

function getReadableEventCreateErrorMessage(error: unknown): string {
  if (error instanceof GoogleApiError) {
    const detailed = extractGoogleApiErrorDetail(error);

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

function buildGoogleCreatePayload(payload: CreateEventPayload): {
  event: GoogleCreateCalendarEventInput;
  sendUpdates: "all" | "externalOnly" | "none";
  conferenceDataVersion: 0 | 1;
} {
  const title = payload.title?.trim();
  if (!title) {
    throw new ApiRouteError("Titolo evento obbligatorio.", 400);
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
      throw new ApiRouteError("Data/ora inizio e fine obbligatorie.", 400);
    }
    if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
      throw new ApiRouteError(
        "L'orario di fine deve essere successivo all'inizio.",
        400
      );
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

    const integrationRow = decryptIntegrationTokens(integration as CalendarIntegrationRow);
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

    const upsertPayload = mapGoogleEventToExternalEventRow(
      createdGoogleEvent,
      integrationRow
    );
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
    if (error instanceof ApiRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof GoogleApiError) {
      const message = getReadableEventCreateErrorMessage(error);
      const status = toGoogleApiStatus(error);
      return NextResponse.json({ error: message }, { status });
    }
    const message = getReadableEventCreateErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
