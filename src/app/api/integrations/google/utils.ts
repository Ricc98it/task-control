import { GoogleApiError, type GoogleCalendarEvent } from "@/lib/googleCalendar";

export class ApiRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type GoogleEventRowContext = {
  id: string;
  user_id: string;
  calendar_id: string;
};

export function normalizeDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeAllDayDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function extractMeetingUrl(event: GoogleCalendarEvent): string | null {
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

function mapGoogleEventAttendees(event: GoogleCalendarEvent) {
  return (event.attendees ?? []).map((attendee) => ({
    email: attendee.email ?? null,
    displayName: attendee.displayName ?? null,
    responseStatus: attendee.responseStatus ?? null,
    organizer: Boolean(attendee.organizer),
    optional: Boolean(attendee.optional),
    self: Boolean(attendee.self),
  }));
}

export function mapGoogleEventToExternalEventFields(event: GoogleCalendarEvent) {
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const startsAt = isAllDay
    ? normalizeAllDayDate(event.start?.date)
    : normalizeDateTime(event.start?.dateTime);
  const endsAt = isAllDay
    ? normalizeAllDayDate(event.end?.date)
    : normalizeDateTime(event.end?.dateTime);
  const meetingUrl = extractMeetingUrl(event);
  const conferenceType = event.conferenceData?.conferenceSolution?.key?.type ?? null;

  return {
    status: event.status ?? "confirmed",
    title: event.summary ?? null,
    description: event.description ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: isAllDay,
    meeting_url: meetingUrl,
    meeting_provider: conferenceType,
    attendees: mapGoogleEventAttendees(event),
    raw_payload: event,
    updated_at: new Date().toISOString(),
  };
}

export function mapGoogleEventToExternalEventRow(
  event: GoogleCalendarEvent,
  integration: GoogleEventRowContext
) {
  return {
    user_id: integration.user_id,
    integration_id: integration.id,
    provider: "GOOGLE",
    provider_event_id: event.id,
    calendar_id: integration.calendar_id || "primary",
    ...mapGoogleEventToExternalEventFields(event),
  };
}

export function parseEmailList(input?: string[]): string[] {
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

export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function addDaysToDateOnly(value: string, days: number): string {
  const date = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function toIsoDateTime(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function extractGoogleApiErrorDetail(error: GoogleApiError): string | null {
  const body = error.body as
    | {
        error_description?: string;
        error?: string | { message?: string };
        message?: string;
      }
    | null;

  return (
    body?.error_description ??
    (typeof body?.error === "string"
      ? body.error
      : body?.error?.message ?? body?.message ?? null)
  );
}

export function toGoogleApiStatus(error: GoogleApiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}
