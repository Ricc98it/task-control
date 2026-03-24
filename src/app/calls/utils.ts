import type { SelectOption } from "@/components/Select";
import type {
  AttendeeStatusGroup,
  CalendarAttendee,
  CalendarEvent,
  CreateEventFormState,
  EventEditFormState,
  TimedEventLayout,
} from "@/app/calls/types";

export const HOURS_START = 8;
export const HOURS_END = 20;
export const GRID_HEIGHT = 430;
export const EVENT_MIN_HEIGHT_PX = 14;

const COLLEAGUE_COLOR_PALETTE = [
  "#1a73e8",
  "#d93025",
  "#188038",
  "#9334e6",
  "#ef6c00",
  "#0097a7",
  "#7b1fa2",
  "#5f6368",
];

export const VISIBILITY_OPTIONS: SelectOption[] = [
  { value: "default", label: "Default calendario" },
  { value: "private", label: "Privato" },
  { value: "public", label: "Pubblico" },
  { value: "confidential", label: "Confidenziale" },
];

export const SEND_UPDATES_OPTIONS: SelectOption[] = [
  { value: "all", label: "Invia inviti a tutti" },
  { value: "externalOnly", label: "Solo invitati esterni" },
  { value: "none", label: "Non inviare inviti" },
];

export function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function asDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getEventAttendees(event: CalendarEvent): CalendarAttendee[] {
  if (!Array.isArray(event.attendees)) return [];
  return event.attendees.filter((attendee) => Boolean(attendee));
}

export function normalizeAttendeeStatus(
  status: string | null | undefined
): AttendeeStatusGroup {
  if (status === "accepted") return "accepted";
  if (status === "tentative") return "tentative";
  if (status === "declined") return "declined";
  return "needsAction";
}

export function attendeeStatusClass(status: AttendeeStatusGroup): string {
  if (status === "accepted") return "calls-attendee-accepted";
  if (status === "tentative") return "calls-attendee-tentative";
  if (status === "declined") return "calls-attendee-declined";
  return "calls-attendee-pending";
}

export function attendeeStatusRank(status: AttendeeStatusGroup): number {
  if (status === "accepted") return 0;
  if (status === "tentative") return 1;
  if (status === "declined") return 2;
  return 3;
}

function formatDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// For all-day events stored as UTC timestamps, use UTC date parts to avoid timezone shifts.
function formatDateInputValueUTC(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInputValue(value: Date): string {
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function getDefaultEventEditFormState(event: CalendarEvent): EventEditFormState {
  const startDate = asDate(event.starts_at) ?? new Date();
  const endDateRaw = asDate(event.ends_at);
  const fallbackEnd = new Date(startDate.getTime() + 30 * 60 * 1000);
  const safeEnd = endDateRaw && endDateRaw > startDate ? endDateRaw : fallbackEnd;

  // All-day events are stored as UTC noon timestamps: use UTC date methods to
  // extract the correct calendar date regardless of the user's timezone.
  const dateToString = event.is_all_day ? formatDateInputValueUTC : formatDateInputValue;
  const startDateValue = dateToString(startDate);
  const allDayEndCandidate = new Date(safeEnd.getTime() - 24 * 60 * 60 * 1000);
  const allDayEndDateValue =
    allDayEndCandidate >= startDate ? allDayEndCandidate : startDate;

  return {
    title: event.title ?? "",
    description: event.description ?? "",
    isAllDay: event.is_all_day,
    startDate: startDateValue,
    endDate: event.is_all_day
      ? dateToString(allDayEndDateValue)
      : dateToString(safeEnd),
    startTime: formatTimeInputValue(startDate),
    endTime: formatTimeInputValue(safeEnd),
  };
}

function roundDateToNextQuarterHour(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;
  if (rounded === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(rounded, 0, 0);
  }
  return next;
}

export function getDefaultCreateEventFormState(): CreateEventFormState {
  const now = new Date();
  const start = roundDateToNextQuarterHour(now);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const dateInput = formatDateInputValue(start);

  return {
    title: "",
    description: "",
    location: "",
    isAllDay: false,
    selectedDates: [dateInput],
    startTime: formatTimeInputValue(start),
    endTime: formatTimeInputValue(end),
    attendeeEmails: [],
    addGoogleMeet: true,
    visibility: "default",
    guestsCanInviteOthers: true,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
    sendUpdates: "all",
    useDefaultReminders: true,
    reminderMinutesText: "10,30",
  };
}

export function normalizeEmail(value: string): string | null {
  const next = value.trim().toLowerCase();
  if (!next) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return null;
  return next;
}

export function getDateBounds(values: string[]): { startDate: string; endDate: string } | null {
  const cleaned = values.filter(Boolean).sort();
  if (cleaned.length === 0) return null;
  return {
    startDate: cleaned[0],
    endDate: cleaned[cleaned.length - 1],
  };
}

export function hasDateGaps(values: string[]): boolean {
  const cleaned = Array.from(new Set(values.filter(Boolean))).sort();
  if (cleaned.length <= 1) return false;
  for (let index = 1; index < cleaned.length; index += 1) {
    const previous = new Date(`${cleaned[index - 1]}T00:00:00`);
    const current = new Date(`${cleaned[index]}T00:00:00`);
    if (
      Number.isNaN(previous.getTime()) ||
      Number.isNaN(current.getTime()) ||
      current.getTime() - previous.getTime() !== 24 * 60 * 60 * 1000
    ) {
      return true;
    }
  }
  return false;
}

export function parseReminderMinutesFromText(value: string): number[] {
  const tokens = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const asNumbers = tokens
    .map((token) => Number.parseInt(token, 10))
    .filter((num) => Number.isInteger(num) && num >= 0 && num <= 40320);
  return Array.from(new Set(asNumbers)).sort((a, b) => a - b);
}

export function combineLocalDateAndTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const composed = `${date}T${time}`;
  const parsed = new Date(composed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  return `${hour}:${minute}`;
});

export function getTimeOptionIndex(value: string): number {
  const index = TIME_OPTIONS.indexOf(value);
  return index >= 0 ? index : 0;
}

export function shiftQuarterHourTime(value: string, quarterSteps: number): string {
  const totalOptions = TIME_OPTIONS.length;
  const index = getTimeOptionIndex(value);
  const normalizedShift = ((quarterSteps % totalOptions) + totalOptions) % totalOptions;
  return TIME_OPTIONS[(index + normalizedShift) % totalOptions];
}

export function splitAttendeeCandidates(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getColorForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return COLLEAGUE_COLOR_PALETTE[0];
  const index = hashString(normalized) % COLLEAGUE_COLOR_PALETTE.length;
  return COLLEAGUE_COLOR_PALETTE[index];
}

export function hexToRgba(hex: string, alpha: number): string {
  const safe = hex.replace("#", "");
  const full =
    safe.length === 3
      ? safe
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : safe;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function layoutOverlappingTimedEvents(
  segments: TimedEventLayout[]
): TimedEventLayout[] {
  if (segments.length <= 1) {
    return segments.map((segment) => ({ ...segment, columnIndex: 0, columnCount: 1 }));
  }

  const sorted = [...segments].sort((left, right) => {
    if (left.startMinutes !== right.startMinutes) {
      return left.startMinutes - right.startMinutes;
    }
    const leftDuration = left.endMinutes - left.startMinutes;
    const rightDuration = right.endMinutes - right.startMinutes;
    return rightDuration - leftDuration;
  });

  const groups: TimedEventLayout[][] = [];
  let currentGroup: TimedEventLayout[] = [];
  let currentGroupEnd = -Infinity;

  for (const segment of sorted) {
    if (currentGroup.length === 0) {
      currentGroup = [segment];
      currentGroupEnd = segment.endMinutes;
      continue;
    }

    if (segment.startMinutes < currentGroupEnd) {
      currentGroup.push(segment);
      currentGroupEnd = Math.max(currentGroupEnd, segment.endMinutes);
      continue;
    }

    groups.push(currentGroup);
    currentGroup = [segment];
    currentGroupEnd = segment.endMinutes;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const positioned: TimedEventLayout[] = [];

  for (const group of groups) {
    const columnEndMinutes: number[] = [];
    const withColumns = group.map((segment) => ({ ...segment, columnIndex: 0, columnCount: 1 }));

    for (const segment of withColumns) {
      let column = 0;
      while (
        column < columnEndMinutes.length &&
        segment.startMinutes < columnEndMinutes[column]
      ) {
        column += 1;
      }

      if (column === columnEndMinutes.length) {
        columnEndMinutes.push(segment.endMinutes);
      } else {
        columnEndMinutes[column] = segment.endMinutes;
      }

      segment.columnIndex = column;
    }

    const totalColumns = Math.max(1, columnEndMinutes.length);
    for (const segment of withColumns) {
      segment.columnCount = totalColumns;
      positioned.push(segment);
    }
  }

  return positioned;
}
