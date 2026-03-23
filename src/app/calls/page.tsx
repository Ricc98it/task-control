"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import DatePicker from "@/components/DatePicker";
import Icon from "@/components/Icon";
import Nav from "@/components/Nav";
import Select, { type SelectOption } from "@/components/Select";
import { ensureSession } from "@/lib/autoSession";
import { addDays, formatDisplayDate, formatISODate, startOfWeek } from "@/lib/tasks";
import { supabase } from "@/lib/supabaseClient";

type CalendarAttendee = {
  email?: string | null;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
  optional?: boolean;
  self?: boolean;
};

type CalendarEvent = {
  id: string;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
  meeting_url: string | null;
  status: string;
  attendees: CalendarAttendee[] | null;
  ownerEmail?: string | null;
  readOnly?: boolean;
  calendarColor?: string | null;
};

type GoogleStatus = {
  connected: boolean;
  provider: "GOOGLE";
  providerAccountEmail?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
};

type CreateEventFormState = {
  title: string;
  description: string;
  location: string;
  isAllDay: boolean;
  selectedDates: string[];
  startTime: string;
  endTime: string;
  attendeeEmails: string[];
  addGoogleMeet: boolean;
  visibility: "default" | "public" | "private" | "confidential";
  guestsCanInviteOthers: boolean;
  guestsCanModify: boolean;
  guestsCanSeeOtherGuests: boolean;
  sendUpdates: "all" | "externalOnly" | "none";
  useDefaultReminders: boolean;
  reminderMinutesText: string;
};

type CreateEventStep = 1 | 2 | 3;
type EventMutationState = null | "saving" | "deleting" | "addingAttendee";

type EventEditFormState = {
  title: string;
  description: string;
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

const HOURS_START = 8;
const HOURS_END = 20;
const GRID_HEIGHT = 430;
const EVENT_MIN_HEIGHT_PX = 14;
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

const VISIBILITY_OPTIONS: SelectOption[] = [
  { value: "default", label: "Default calendario" },
  { value: "private", label: "Privato" },
  { value: "public", label: "Pubblico" },
  { value: "confidential", label: "Confidenziale" },
];

const SEND_UPDATES_OPTIONS: SelectOption[] = [
  { value: "all", label: "Invia inviti a tutti" },
  { value: "externalOnly", label: "Solo invitati esterni" },
  { value: "none", label: "Non inviare inviti" },
];

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function asDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getEventAttendees(event: CalendarEvent): CalendarAttendee[] {
  if (!Array.isArray(event.attendees)) return [];
  return event.attendees.filter((attendee) => Boolean(attendee));
}

type AttendeeStatusGroup = "accepted" | "tentative" | "declined" | "needsAction";
type RsvpStatus = Exclude<AttendeeStatusGroup, "needsAction">;

function normalizeAttendeeStatus(status: string | null | undefined): AttendeeStatusGroup {
  if (status === "accepted") return "accepted";
  if (status === "tentative") return "tentative";
  if (status === "declined") return "declined";
  return "needsAction";
}

function attendeeStatusClass(status: AttendeeStatusGroup): string {
  if (status === "accepted") return "calls-attendee-accepted";
  if (status === "tentative") return "calls-attendee-tentative";
  if (status === "declined") return "calls-attendee-declined";
  return "calls-attendee-pending";
}

function attendeeStatusRank(status: AttendeeStatusGroup): number {
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

function getDefaultEventEditFormState(event: CalendarEvent): EventEditFormState {
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

function getDefaultCreateEventFormState(): CreateEventFormState {
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

function normalizeEmail(value: string): string | null {
  const next = value.trim().toLowerCase();
  if (!next) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return null;
  return next;
}

function getDateBounds(values: string[]): { startDate: string; endDate: string } | null {
  const cleaned = values.filter(Boolean).sort();
  if (cleaned.length === 0) return null;
  return {
    startDate: cleaned[0],
    endDate: cleaned[cleaned.length - 1],
  };
}

function hasDateGaps(values: string[]): boolean {
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

function parseReminderMinutesFromText(value: string): number[] {
  const tokens = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const asNumbers = tokens
    .map((token) => Number.parseInt(token, 10))
    .filter((num) => Number.isInteger(num) && num >= 0 && num <= 40320);
  return Array.from(new Set(asNumbers)).sort((a, b) => a - b);
}

function combineLocalDateAndTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const composed = `${date}T${time}`;
  const parsed = new Date(composed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = String(Math.floor(index / 4)).padStart(2, "0");
  const minute = String((index % 4) * 15).padStart(2, "0");
  return `${hour}:${minute}`;
});

function getTimeOptionIndex(value: string): number {
  const index = TIME_OPTIONS.indexOf(value);
  return index >= 0 ? index : 0;
}

function shiftQuarterHourTime(value: string, quarterSteps: number): string {
  const totalOptions = TIME_OPTIONS.length;
  const index = getTimeOptionIndex(value);
  const normalizedShift = ((quarterSteps % totalOptions) + totalOptions) % totalOptions;
  return TIME_OPTIONS[(index + normalizedShift) % totalOptions];
}

function splitAttendeeCandidates(value: string): string[] {
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

function getColorForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return COLLEAGUE_COLOR_PALETTE[0];
  const index = hashString(normalized) % COLLEAGUE_COLOR_PALETTE.length;
  return COLLEAGUE_COLOR_PALETTE[index];
}

function hexToRgba(hex: string, alpha: number): string {
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

type TimedEventLayout = {
  event: CalendarEvent;
  segmentStart: Date;
  segmentEnd: Date;
  startMinutes: number;
  endMinutes: number;
  top: number;
  height: number;
  pixelHeight: number;
  columnIndex: number;
  columnCount: number;
};

function layoutOverlappingTimedEvents(segments: TimedEventLayout[]): TimedEventLayout[] {
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

type IosToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
};

function IosToggleRow({
  label,
  checked,
  onChange,
  description,
  disabled = false,
}: IosToggleRowProps) {
  const inputId = useId();
  return (
    <label
      htmlFor={inputId}
      className={`calls-ios-toggle-row ${disabled ? "is-disabled" : ""}`.trim()}
    >
      <div className="calls-ios-toggle-copy">
        <p className="calls-ios-toggle-label">{label}</p>
        {description ? <p className="calls-ios-toggle-description">{description}</p> : null}
      </div>
      <span className="calls-ios-toggle-wrap">
        <input
          id={inputId}
          type="checkbox"
          className="calls-ios-toggle-input"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          aria-label={label}
        />
        <span className="calls-ios-toggle" aria-hidden="true">
          <span className="calls-ios-toggle-knob" />
        </span>
      </span>
    </label>
  );
}

function CallsTimePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!menuRef.current) return;
    const activeIndex = getTimeOptionIndex(value);
    const itemHeight = 32;
    const nextScrollTop = Math.max(0, (activeIndex - 2) * itemHeight);
    menuRef.current.scrollTop = nextScrollTop;
  }, [isOpen, value]);

  return (
    <div className="calls-create-time-field calls-time-dropdown" ref={rootRef}>
      <span className="calls-create-time-caption" aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        className="glass-input calls-time-overlay-trigger calls-time-dropdown-trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label={`Seleziona ora ${label.toLowerCase()}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value}</span>
        <span className="calls-time-overlay-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div className="calls-time-dropdown-menu" role="listbox" ref={menuRef}>
          {TIME_OPTIONS.map((option) => (
            <button
              key={`${label}-${option}`}
              type="button"
              className={`calls-time-dropdown-option ${
                option === value ? "is-active" : ""
              }`.trim()}
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CallsPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [colleagueEvents, setColleagueEvents] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [, setStatus] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [, setErr] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateEventStep>(1);
  const [createEventForm, setCreateEventForm] = useState<CreateEventFormState>(
    getDefaultCreateEventFormState
  );
  const [createAttendeeInput, setCreateAttendeeInput] = useState("");
  const [createAttendeeError, setCreateAttendeeError] = useState<string | null>(null);
  const [knownAttendeeEmails, setKnownAttendeeEmails] = useState<string[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createTitleInvalidFlash, setCreateTitleInvalidFlash] = useState(false);
  const [rsvpUpdating, setRsvpUpdating] = useState<RsvpStatus | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [eventEditForm, setEventEditForm] = useState<EventEditFormState | null>(null);
  const [eventMutationState, setEventMutationState] = useState<EventMutationState>(null);
  const [eventMutationError, setEventMutationError] = useState<string | null>(null);
  const [colleagueInput, setColleagueInput] = useState("");
  const [colleagueSuggestions, setColleagueSuggestions] = useState<string[]>([]);
  const [colleagueSelectedEmails, setColleagueSelectedEmails] = useState<string[]>([]);
  const [, setColleagueLoadingSuggestions] = useState(false);
  const [, setColleagueLoadingEvents] = useState(false);
  const [colleagueError, setColleagueError] = useState<string | null>(null);
  const autoSyncDoneRef = useRef(false);
  const createEventFormRef = useRef<HTMLFormElement | null>(null);
  const createTitleInputRef = useRef<HTMLInputElement | null>(null);
  const createTitleFlashTimerRef = useRef<number | null>(null);
  const userTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );
  const todayIso = useMemo(() => formatISODate(new Date()), []);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
        return {
          id: formatISODate(date),
          label: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date),
          date,
        };
      }),
    [weekStart]
  );
  const hours = useMemo(
    () => Array.from({ length: HOURS_END - HOURS_START + 1 }, (_, idx) => HOURS_START + idx),
    []
  );
  const mergedEvents = useMemo(
    () => [...events, ...colleagueEvents],
    [colleagueEvents, events]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const dayRanges = days.map((day) => {
      const dayStart = new Date(day.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = addDays(dayStart, 1);
      return {
        id: day.id,
        dayStartMs: dayStart.getTime(),
        dayEndMs: dayEnd.getTime(),
      };
    });

    mergedEvents.forEach((event) => {
      const startsAt = asDate(event.starts_at);
      if (!startsAt) return;
      const rawEndsAt = asDate(event.ends_at);
      const fallbackMs = event.is_all_day ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
      const endsAtMs =
        rawEndsAt && rawEndsAt.getTime() > startsAt.getTime()
          ? rawEndsAt.getTime()
          : startsAt.getTime() + fallbackMs;

      dayRanges.forEach((range) => {
        if (startsAt.getTime() >= range.dayEndMs || endsAtMs <= range.dayStartMs) return;
        const list = map.get(range.id) ?? [];
        list.push(event);
        map.set(range.id, list);
      });
    });

    map.forEach((list) => {
      list.sort((left, right) => {
        const leftStart = asDate(left.starts_at)?.getTime() ?? 0;
        const rightStart = asDate(right.starts_at)?.getTime() ?? 0;
        return leftStart - rightStart;
      });
    });

    return map;
  }, [days, mergedEvents]);

  const loadEvents = useCallback(async () => {
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 7);
    const columns =
      "id,title,description,starts_at,ends_at,is_all_day,meeting_url,status,attendees";

    const [withinWindow, overlappingFromPast] = await Promise.all([
      supabase
        .from("external_calendar_events")
        .select(columns)
        .neq("status", "cancelled")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString()),
      supabase
        .from("external_calendar_events")
        .select(columns)
        .neq("status", "cancelled")
        .lt("starts_at", start.toISOString())
        .gt("ends_at", start.toISOString()),
    ]);

    if (withinWindow.error) {
      throw new Error(withinWindow.error.message);
    }
    if (overlappingFromPast.error) {
      throw new Error(overlappingFromPast.error.message);
    }

    const merged = new Map<string, CalendarEvent>();
    for (const row of (withinWindow.data ?? []) as CalendarEvent[]) {
      merged.set(row.id, row);
    }
    for (const row of (overlappingFromPast.data ?? []) as CalendarEvent[]) {
      merged.set(row.id, row);
    }

    const sorted = Array.from(merged.values()).sort((left, right) => {
      const leftStart = asDate(left.starts_at)?.getTime() ?? 0;
      const rightStart = asDate(right.starts_at)?.getTime() ?? 0;
      return leftStart - rightStart;
    });

    setEvents(
      sorted.map((event) => ({
        ...event,
        readOnly: false,
        calendarColor: null,
      }))
    );
  }, [weekStart]);

  const loadKnownAttendeeEmails = useCallback(async () => {
    const { data, error } = await supabase
      .from("external_calendar_events")
      .select("attendees")
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(350);

    if (error) {
      return;
    }

    const next = new Set<string>();
    for (const row of data ?? []) {
      const attendees = Array.isArray((row as { attendees?: unknown }).attendees)
        ? ((row as { attendees?: CalendarAttendee[] }).attendees ?? [])
        : [];
      for (const attendee of attendees) {
        const normalized = normalizeEmail(attendee?.email ?? "");
        if (normalized) {
          next.add(normalized);
        }
      }
    }
    setKnownAttendeeEmails(Array.from(next).sort((a, b) => a.localeCompare(b)));
  }, []);

  const getAccessToken = useCallback(async () => {
    const session = await ensureSession();
    return session?.access_token ?? null;
  }, []);

  const loadStatus = useCallback(
    async (accessToken: string) => {
      const response = await fetch("/api/integrations/google/status", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as GoogleStatus & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Errore stato integrazione.");
      }
      setStatus(payload);
      setConnected(payload.connected === true);
      return payload;
    },
    []
  );

  const runSync = useCallback(
    async (accessToken: string, forceFullSync = false) => {
      const response = await fetch("/api/integrations/google/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ forceFullSync }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        upsertedCount?: number;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Sync non riuscita.");
      }
      return payload;
    },
    []
  );

  const refreshPageData = useCallback(
    async (withAutoSync: boolean) => {
      setErr(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setConnected(false);
          setStatus(null);
          setEvents([]);
          setColleagueEvents([]);
          return;
        }

        const integrationStatus = await loadStatus(accessToken);
        if (integrationStatus.connected && withAutoSync && !autoSyncDoneRef.current) {
          setSyncing(true);
          await runSync(accessToken, false);
          autoSyncDoneRef.current = true;
          await loadStatus(accessToken);
          setSyncing(false);
        }

        await loadEvents();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Errore caricamento call.");
      }
    },
    [getAccessToken, loadEvents, loadStatus, runSync]
  );

  useEffect(() => {
    void refreshPageData(true);
  }, [refreshPageData]);

  useEffect(() => {
    void refreshPageData(false);
  }, [weekStart, refreshPageData]);

  async function handleManualSync() {
    setSyncing(true);
    setErr(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setErr("Sessione non disponibile.");
        return;
      }
      await runSync(accessToken, false);
      await loadStatus(accessToken);
      await loadEvents();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore sync.");
    } finally {
      setSyncing(false);
    }
  }

  const loadColleagueSuggestions = useCallback(async (query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      setColleagueSuggestions([]);
      return;
    }

    setColleagueError(null);
    setColleagueLoadingSuggestions(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setColleagueSuggestions([]);
        return;
      }

      const response = await fetch(
        `/api/integrations/google/colleagues?q=${encodeURIComponent(trimmed)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const payload = (await response.json()) as {
        emails?: string[];
        error?: string;
        warning?: string | null;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Ricerca colleghi non riuscita.");
      }

      const available = (payload.emails ?? []).filter(
        (email) => !colleagueSelectedEmails.includes(email)
      );
      setColleagueSuggestions(available.slice(0, 12));
      if (payload.warning && available.length === 0) {
        setColleagueError(payload.warning);
      }
    } catch (error) {
      setColleagueSuggestions([]);
      setColleagueError(
        error instanceof Error ? error.message : "Errore ricerca colleghi."
      );
    } finally {
      setColleagueLoadingSuggestions(false);
    }
  }, [colleagueSelectedEmails, getAccessToken]);

  useEffect(() => {
    const query = colleagueInput.trim();
    if (!query) {
      setColleagueSuggestions([]);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadColleagueSuggestions(query);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [colleagueInput, loadColleagueSuggestions]);

  useEffect(() => {
    async function loadColleagueEvents() {
      if (colleagueSelectedEmails.length === 0) {
        setColleagueEvents([]);
        return;
      }

      setColleagueLoadingEvents(true);
      setColleagueError(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setColleagueEvents([]);
          return;
        }

        const start = new Date(weekStart);
        start.setHours(0, 0, 0, 0);
        const end = addDays(start, 7);

        const response = await fetch("/api/integrations/google/colleagues", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            emails: colleagueSelectedEmails,
            start: start.toISOString(),
            end: end.toISOString(),
          }),
        });

        const payload = (await response.json()) as {
          events?: CalendarEvent[];
          error?: string;
          warning?: string | null;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Caricamento calendari colleghi non riuscito.");
        }

        const normalized = (payload.events ?? []).map((event) => {
          const ownerEmail = event.ownerEmail?.trim().toLowerCase() ?? "";
          return {
            ...event,
            ownerEmail,
            readOnly: true,
            calendarColor: ownerEmail ? getColorForEmail(ownerEmail) : "#5f6368",
          };
        });
        setColleagueEvents(normalized);
        setColleagueError(payload.warning ?? null);
      } catch (error) {
        setColleagueEvents([]);
        setColleagueError(
          error instanceof Error ? error.message : "Errore caricamento calendari colleghi."
        );
      } finally {
        setColleagueLoadingEvents(false);
      }
    }

    void loadColleagueEvents();
  }, [colleagueSelectedEmails, getAccessToken, weekStart]);

  function addColleagueEmail(email: string) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setColleagueError("Inserisci una mail valida.");
      return;
    }
    setColleagueError(null);
    setColleagueSelectedEmails((current) =>
      current.includes(normalized) ? current : [...current, normalized]
    );
    setColleagueInput("");
    setColleagueSuggestions([]);
  }

  function removeColleagueEmail(email: string) {
    setColleagueSelectedEmails((current) => current.filter((item) => item !== email));
  }

  function openCreateEventModal() {
    setCreateEventForm(getDefaultCreateEventFormState());
    setCreateStep(1);
    setCreateError(null);
    setCreateSubmitting(false);
    setCreateTitleInvalidFlash(false);
    setCreateAttendeeInput("");
    setCreateAttendeeError(null);
    setCreateEventOpen(true);
    void loadKnownAttendeeEmails();
  }

  const closeCreateEventModal = useCallback(() => {
    if (createSubmitting) return;
    setCreateEventOpen(false);
    setCreateError(null);
    setCreateAttendeeError(null);
    setCreateTitleInvalidFlash(false);
    if (createTitleFlashTimerRef.current !== null) {
      window.clearTimeout(createTitleFlashTimerRef.current);
      createTitleFlashTimerRef.current = null;
    }
  }, [createSubmitting]);

  function triggerCreateTitleInvalidFlash() {
    setCreateError(null);
    setCreateTitleInvalidFlash(false);
    requestAnimationFrame(() => {
      setCreateTitleInvalidFlash(true);
      createTitleInputRef.current?.focus();
    });
    if (createTitleFlashTimerRef.current !== null) {
      window.clearTimeout(createTitleFlashTimerRef.current);
    }
    createTitleFlashTimerRef.current = window.setTimeout(() => {
      setCreateTitleInvalidFlash(false);
      createTitleFlashTimerRef.current = null;
    }, 550);
  }

  function removeAttendeeEmail(email: string) {
    setCreateEventForm((current) => ({
      ...current,
      attendeeEmails: current.attendeeEmails.filter((item) => item !== email),
    }));
  }

  function commitAttendeeInput(explicitValue?: string) {
    const source = (explicitValue ?? createAttendeeInput).trim().replace(/[;,]$/, "");
    if (!source) {
      setCreateAttendeeInput("");
      return;
    }

    const candidates = splitAttendeeCandidates(source);
    const validEmails: string[] = [];
    let hasInvalid = false;
    for (const candidate of candidates) {
      const normalized = normalizeEmail(candidate);
      if (!normalized) {
        hasInvalid = true;
        continue;
      }
      validEmails.push(normalized);
    }

    if (validEmails.length === 0) {
      setCreateAttendeeError("Inserisci almeno un'email valida.");
      return;
    }

    setCreateEventForm((current) => {
      const next = new Set(current.attendeeEmails);
      validEmails.forEach((email) => next.add(email));
      return {
        ...current,
        attendeeEmails: Array.from(next),
      };
    });
    setCreateAttendeeError(
      hasInvalid ? "Alcuni valori non sono email valide e sono stati ignorati." : null
    );
    setCreateAttendeeInput("");
  }

  function validateCreateStep(step: CreateEventStep): string | null {
    if (step === 1) {
      if (!createEventForm.title.trim()) {
        return "Inserisci un titolo evento.";
      }

      const dateBounds = getDateBounds(createEventForm.selectedDates);
      if (!dateBounds) {
        return "Seleziona almeno un giorno.";
      }
      if (hasDateGaps(createEventForm.selectedDates)) {
        return "Seleziona giorni consecutivi (intervallo continuo).";
      }

      if (!createEventForm.isAllDay) {
        const startDateTime = combineLocalDateAndTime(
          dateBounds.startDate,
          createEventForm.startTime
        );
        const endDateTime = combineLocalDateAndTime(
          dateBounds.endDate,
          createEventForm.endTime
        );
        if (!startDateTime || !endDateTime) {
          return "Seleziona orario di inizio e fine.";
        }
        if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
          return "L'orario di fine deve essere successivo all'inizio.";
        }
      }
    }

    return null;
  }

  function handleCreateStepForward() {
    if (createStep === 1 && !createEventForm.title.trim()) {
      triggerCreateTitleInvalidFlash();
      return;
    }
    const currentError = validateCreateStep(createStep);
    if (currentError) {
      setCreateError(currentError);
      return;
    }
    setCreateError(null);
    setCreateStep((current) => (current < 3 ? ((current + 1) as CreateEventStep) : current));
  }

  function handleCreateStepBack() {
    if (createSubmitting) return;
    setCreateError(null);
    setCreateStep((current) => (current > 1 ? ((current - 1) as CreateEventStep) : current));
  }

  async function handleCreateEventSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createStep < 3) {
      handleCreateStepForward();
      return;
    }

    const fullError = validateCreateStep(1);
    if (fullError) {
      if (!createEventForm.title.trim()) {
        triggerCreateTitleInvalidFlash();
      }
      setCreateError(fullError);
      return;
    }

    setCreateError(null);
    setCreateSubmitting(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setCreateError("Sessione non disponibile.");
        return;
      }

      const dateBounds = getDateBounds(createEventForm.selectedDates);
      if (!dateBounds) {
        setCreateError("Seleziona almeno un giorno.");
        return;
      }

      const attendeeEmails = createEventForm.attendeeEmails;
      const reminderMinutes = createEventForm.useDefaultReminders
        ? []
        : parseReminderMinutesFromText(createEventForm.reminderMinutesText);
      const startDateTime = combineLocalDateAndTime(
        dateBounds.startDate,
        createEventForm.startTime
      );
      const endDateTime = combineLocalDateAndTime(
        dateBounds.endDate,
        createEventForm.endTime
      );
      const response = await fetch("/api/integrations/google/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: createEventForm.title,
          description: createEventForm.description,
          location: createEventForm.location,
          isAllDay: createEventForm.isAllDay,
          startDate: dateBounds.startDate,
          endDate: dateBounds.endDate,
          startDateTime,
          endDateTime,
          attendeeEmails,
          addGoogleMeet: createEventForm.addGoogleMeet,
          visibility: createEventForm.visibility,
          guestsCanInviteOthers: createEventForm.guestsCanInviteOthers,
          guestsCanModify: createEventForm.guestsCanModify,
          guestsCanSeeOtherGuests: createEventForm.guestsCanSeeOtherGuests,
          sendUpdates: createEventForm.sendUpdates,
          useDefaultReminders: createEventForm.useDefaultReminders,
          reminderMinutes,
          timeZone: userTimeZone,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        event?: CalendarEvent;
      };
      if (!response.ok || !payload.ok || !payload.event) {
        throw new Error(payload.error ?? "Creazione evento non riuscita.");
      }

      setCreateEventOpen(false);
      setCreateStep(1);
      setCreateEventForm(getDefaultCreateEventFormState());
      setCreateAttendeeInput("");
      setCreateAttendeeError(null);
      await loadStatus(accessToken);
      await loadEvents();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Errore creazione evento.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  useEffect(() => {
    if (!selectedEvent) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedEvent(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedEvent]);

  useEffect(() => {
    if (!createEventOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!createSubmitting) {
          closeCreateEventModal();
        }
      }
    }

    function handleEnter(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest(".date-popover, .select-menu")) return;
      if (document.querySelector(".date-overlay, .select-menu")) return;

      event.preventDefault();
      if (createSubmitting) return;
      createEventFormRef.current?.requestSubmit();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("keydown", handleEnter);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("keydown", handleEnter);
    };
  }, [createEventOpen, createSubmitting, closeCreateEventModal]);

  useEffect(() => {
    return () => {
      if (createTitleFlashTimerRef.current !== null) {
        window.clearTimeout(createTitleFlashTimerRef.current);
      }
    };
  }, []);

  const selectedEventStart = asDate(selectedEvent?.starts_at ?? null);
  const selectedEventEnd = asDate(selectedEvent?.ends_at ?? null);
  const selectedEventIsReadOnly = selectedEvent?.readOnly === true;
  const selectedEventAttendees = useMemo(() => {
    if (!selectedEvent) return [];
    return getEventAttendees(selectedEvent)
      .map((attendee) => ({
        ...attendee,
        _status: normalizeAttendeeStatus(attendee.responseStatus),
      }))
      .sort((a, b) => attendeeStatusRank(a._status) - attendeeStatusRank(b._status));
  }, [selectedEvent]);
  const selectedSelfRsvpStatus = useMemo<RsvpStatus | null>(() => {
    const selfAttendee = selectedEventAttendees.find((attendee) => attendee.self === true);
    if (!selfAttendee) return null;
    const normalized = normalizeAttendeeStatus(selfAttendee.responseStatus);
    if (normalized === "needsAction") return null;
    return normalized;
  }, [selectedEventAttendees]);
  const attendeeSuggestions = useMemo(() => {
    const query = createAttendeeInput.trim().toLowerCase().replace(/[;,]$/, "");
    const available = knownAttendeeEmails.filter(
      (email) => !createEventForm.attendeeEmails.includes(email)
    );
    if (!query) return [];

    return available.filter((email) => email.includes(query)).slice(0, 8);
  }, [createAttendeeInput, createEventForm.attendeeEmails, knownAttendeeEmails]);

  useEffect(() => {
    setRsvpError(null);
    setRsvpUpdating(null);
    setEventMutationState(null);
    setEventMutationError(null);
    setEventEditOpen(false);
    setEventEditForm(selectedEvent ? getDefaultEventEditFormState(selectedEvent) : null);
  }, [selectedEvent]);

  function applyUpdatedEvent(updatedEvent: CalendarEvent) {
    setSelectedEvent(updatedEvent);
    setEvents((current) =>
      current.map((item) => (item.id === updatedEvent.id ? updatedEvent : item))
    );
  }

  async function handleRsvp(nextStatus: RsvpStatus) {
    if (!selectedEvent) return;
    if (selectedEvent.readOnly) return;
    setRsvpUpdating(nextStatus);
    setRsvpError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setRsvpError("Sessione non disponibile.");
        return;
      }

      const response = await fetch("/api/integrations/google/rsvp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          externalEventId: selectedEvent.id,
          responseStatus: nextStatus,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        event?: CalendarEvent;
      };

      if (!response.ok || !payload.ok || !payload.event) {
        throw new Error(payload.error ?? "Aggiornamento RSVP non riuscito.");
      }

      applyUpdatedEvent(payload.event);
    } catch (error) {
      setRsvpError(error instanceof Error ? error.message : "Errore aggiornamento RSVP.");
    } finally {
      setRsvpUpdating(null);
    }
  }

  async function patchSelectedEvent(
    body: Record<string, unknown>,
    mutationState: Exclude<EventMutationState, null>
  ) {
    if (!selectedEvent) return null;
    if (selectedEvent.readOnly) return null;
    setEventMutationState(mutationState);
    setEventMutationError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setEventMutationError("Sessione non disponibile.");
        return null;
      }

      const response = await fetch(`/api/integrations/google/events/${selectedEvent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        event?: CalendarEvent;
      };
      if (!response.ok || !payload.ok || !payload.event) {
        throw new Error(payload.error ?? "Aggiornamento evento non riuscito.");
      }

      applyUpdatedEvent(payload.event);
      return payload.event;
    } catch (error) {
      setEventMutationError(
        error instanceof Error ? error.message : "Errore aggiornamento evento."
      );
      return null;
    } finally {
      setEventMutationState(null);
    }
  }

  async function handleEventSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEvent || !eventEditForm) return;

    const startDate = eventEditForm.startDate.trim();
    const endDate = eventEditForm.endDate.trim();
    if (!startDate || !endDate) {
      setEventMutationError("Seleziona data inizio e fine.");
      return;
    }
    if (endDate < startDate) {
      setEventMutationError("La data fine non può essere prima della data inizio.");
      return;
    }

    let startDateTime: string | null = null;
    let endDateTime: string | null = null;
    if (!eventEditForm.isAllDay) {
      startDateTime = combineLocalDateAndTime(startDate, eventEditForm.startTime);
      endDateTime = combineLocalDateAndTime(endDate, eventEditForm.endTime);
      if (!startDateTime || !endDateTime) {
        setEventMutationError("Orario inizio/fine non valido.");
        return;
      }
      if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
        setEventMutationError("L'orario di fine deve essere successivo all'inizio.");
        return;
      }
    }

    const updated = await patchSelectedEvent(
      {
        title: eventEditForm.title,
        description: eventEditForm.description,
        isAllDay: eventEditForm.isAllDay,
        startDate,
        endDate,
        startDateTime,
        endDateTime,
        timeZone: userTimeZone,
        sendUpdates: "all",
      },
      "saving"
    );

    if (updated) {
      setEventEditOpen(false);
    }
  }

  async function handleDeleteSelectedEvent() {
    if (!selectedEvent) return;
    if (selectedEvent.readOnly) return;
    if (!window.confirm("Eliminare questo evento da Google Calendar?")) return;

    setEventMutationState("deleting");
    setEventMutationError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setEventMutationError("Sessione non disponibile.");
        return;
      }

      const response = await fetch(`/api/integrations/google/events/${selectedEvent.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Eliminazione evento non riuscita.");
      }

      setEvents((current) => current.filter((item) => item.id !== selectedEvent.id));
      setSelectedEvent(null);
    } catch (error) {
      setEventMutationError(
        error instanceof Error ? error.message : "Errore eliminazione evento."
      );
    } finally {
      setEventMutationState(null);
    }
  }

  async function handleAddAttendeeToSelectedEvent() {
    if (!selectedEvent) return;
    if (selectedEvent.readOnly) return;
    const raw = window.prompt("Inserisci una o più email (separate da virgola):");
    if (!raw) return;

    const existing = getEventAttendees(selectedEvent)
      .map((attendee) => normalizeEmail(attendee.email ?? ""))
      .filter((email): email is string => Boolean(email));
    const incoming = splitAttendeeCandidates(raw)
      .map((candidate) => normalizeEmail(candidate))
      .filter((email): email is string => Boolean(email));

    if (incoming.length === 0) {
      setEventMutationError("Nessuna email valida da aggiungere.");
      return;
    }

    const merged = Array.from(new Set([...existing, ...incoming]));
    await patchSelectedEvent({ attendeeEmails: merged, sendUpdates: "all" }, "addingAttendee");
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-2 sm:px-3 lg:px-4 pt-[50px] pb-6 app-page">
        <div className="app-shell calls-shell px-2 pb-2 pt-0 sm:px-3 sm:pb-3 sm:pt-0">
          <div className="calls-top-actions">
            <div className="calls-top-refresh">
              {connected ? (
                <button
                  type="button"
                  className="calls-ghost-btn"
                  onClick={() => void handleManualSync()}
                  disabled={syncing}
                  title="Sincronizza"
                >
                  {syncing ? "⏳" : "↻"}
                </button>
              ) : (
                <Link href="/settings" className="calls-ghost-btn" title="Collega Google">
                  ⚙️
                </Link>
              )}
            </div>
            <button
              type="button"
              className="calls-ghost-btn calls-top-week"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Questa settimana
            </button>
            {connected ? (
              <div className="calls-top-colleague-wrap calls-top-colleague-slot">
                <input
                  type="text"
                  className="calls-ghost-input"
                  value={colleagueInput}
                  onChange={(event) => {
                    setColleagueInput(event.target.value);
                    if (colleagueError) {
                      setColleagueError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === "," ||
                      event.key === ";" ||
                      event.key === "Tab"
                    ) {
                      event.preventDefault();
                      if (colleagueSuggestions.length > 0) {
                        addColleagueEmail(colleagueSuggestions[0]);
                      } else {
                        addColleagueEmail(colleagueInput);
                      }
                    }
                  }}
                  placeholder="Incontrati con..."
                  aria-label="Incontrati con"
                />
                {colleagueSuggestions.length > 0 ? (
                  <div className="calls-chip-suggestions">
                    {colleagueSuggestions.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="calls-chip-suggestion"
                        onClick={() => addColleagueEmail(email)}
                      >
                        <span className="calls-chip-suggestion-avatar" aria-hidden="true">
                          {email.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="calls-chip-suggestion-email">{email}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {connected ? (
              <button
                type="button"
                className="calls-ghost-btn calls-ghost-btn-new-event calls-top-new-event"
                onClick={openCreateEventModal}
              >
                + Nuovo evento
              </button>
            ) : null}
          </div>
          {connected && colleagueSelectedEmails.length > 0 ? (
            <div className="calls-top-colleague-chips">
              {colleagueSelectedEmails.map((email) => (
                <span
                  key={email}
                  className="calls-chip-item calls-colleague-chip-item"
                  style={{
                    borderColor: hexToRgba(getColorForEmail(email), 0.5),
                    background: hexToRgba(getColorForEmail(email), 0.16),
                  }}
                >
                  <span
                    className="calls-colleague-chip-dot"
                    style={{ backgroundColor: getColorForEmail(email) }}
                    aria-hidden="true"
                  />
                  <span>{email}</span>
                  <button
                    type="button"
                    className="calls-chip-remove"
                    onClick={() => removeColleagueEmail(email)}
                    aria-label={`Rimuovi calendario ${email}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="week-board-shell calls-week-shell">
            <button
              type="button"
              className="week-side-arrow"
              onClick={() => setWeekStart((prev) => addDays(prev, -7))}
              aria-label="Settimana precedente"
            >
              <Icon name="arrow-left" size={22} />
            </button>

            <div className="calls-grid-wrap">
              <div
                className="grid calls-week-grid"
                style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}
              >
              <div className="bg-slate-900/30 border-r border-slate-700/30" />
              {days.map((day) => {
                const isTodayColumn = day.id === todayIso;
                return (
                  <div
                    key={day.id}
                    className={`calls-week-day-head bg-slate-900/30 border-r last:border-r-0 border-slate-700/30 px-3 py-2 ${
                      isTodayColumn ? "calls-week-day-head-today" : ""
                    }`.trim()}
                  >
                    <p
                      className={`calls-week-day-label text-xs uppercase tracking-[0.14em] text-slate-400 ${
                        isTodayColumn ? "calls-week-day-label-today" : ""
                      }`.trim()}
                    >
                      {day.label}
                    </p>
                    <p
                      className={`calls-week-day-date text-sm text-slate-100 font-medium ${
                        isTodayColumn ? "calls-week-day-date-today" : ""
                      }`.trim()}
                    >
                      {formatDisplayDate(day.id)}
                    </p>
                  </div>
                );
              })}

              <div
                className="relative border-r border-slate-700/30 bg-slate-900/20"
                style={{ height: GRID_HEIGHT }}
              >
                {hours.map((hour) => {
                  const ratio = ((hour - HOURS_START) / (HOURS_END - HOURS_START)) * 100;
                  const isLastHour = hour === HOURS_END;
                  return (
                    <span
                      key={hour}
                      className={`absolute left-2 text-[11px] text-slate-400 ${
                        isLastHour ? "" : "-translate-y-1/2"
                      }`.trim()}
                      style={isLastHour ? { bottom: "0" } : { top: `${ratio}%` }}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  );
                })}
              </div>

              {days.map((day) => {
                const dayEvents = eventsByDay.get(day.id) ?? [];
                const allDayEvents = dayEvents.filter((event) => event.is_all_day);
                const timedEvents = dayEvents.filter((event) => !event.is_all_day);
                const dayStart = new Date(day.date);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = addDays(dayStart, 1);
                const isTodayColumn = day.id === todayIso;

                return (
                  <div
                    key={`grid-${day.id}`}
                    className={`calls-week-day-column relative border-r last:border-r-0 border-slate-700/30 bg-slate-950/15 ${
                      isTodayColumn ? "calls-week-day-column-today" : ""
                    }`.trim()}
                    style={{ height: GRID_HEIGHT }}
                  >
                    {hours.map((hour) => {
                      const ratio = ((hour - HOURS_START) / (HOURS_END - HOURS_START)) * 100;
                      return (
                        <div
                          key={`${day.id}-${hour}`}
                          className="absolute left-0 right-0 border-t border-slate-700/25"
                          style={{ top: `${ratio}%` }}
                        />
                      );
                    })}

                    {allDayEvents.slice(0, 2).map((event, index) => {
                      const baseColor = event.calendarColor ?? "#0891b2";
                      const borderColor = hexToRgba(baseColor, 0.62);
                      const backgroundColor = hexToRgba(
                        baseColor,
                        event.readOnly ? 0.2 : 0.26
                      );

                      return (
                        <button
                          type="button"
                          key={`${event.id}-${event.ownerEmail ?? "self"}-${index}`}
                          className="absolute left-1 right-1 rounded border px-1.5 py-0.5 text-left cursor-pointer calls-event-card calls-event-card-all-day"
                          style={{
                            top: `${4 + index * 5}%`,
                            fontSize: "9px",
                            lineHeight: "1.05",
                            borderColor,
                            backgroundColor,
                            color: "rgba(226, 232, 240, 0.96)",
                          }}
                          title={event.title ?? "Call"}
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="truncate">{event.title ?? "Call senza titolo"}</div>
                        </button>
                      );
                    })}

                    {layoutOverlappingTimedEvents(
                      timedEvents
                        .map((event): TimedEventLayout | null => {
                          const startsAt = asDate(event.starts_at);
                          if (!startsAt) return null;
                          const endsAt = asDate(event.ends_at);
                          const fallbackEnd = new Date(startsAt.getTime() + 30 * 60 * 1000);
                          const eventEnd =
                            endsAt && endsAt.getTime() > startsAt.getTime()
                              ? endsAt
                              : fallbackEnd;
                          const segmentStart = startsAt < dayStart ? dayStart : startsAt;
                          const segmentEnd = eventEnd > dayEnd ? dayEnd : eventEnd;

                          if (segmentEnd.getTime() <= segmentStart.getTime()) return null;

                          const startMinutes =
                            segmentStart.getHours() * 60 + segmentStart.getMinutes();
                          const endMinutes = segmentEnd.getHours() * 60 + segmentEnd.getMinutes();
                          const rangeStart = HOURS_START * 60;
                          const rangeEnd = HOURS_END * 60;
                          if (endMinutes <= rangeStart || startMinutes >= rangeEnd) return null;

                          const clampedStart = clamp(startMinutes, rangeStart, rangeEnd);
                          const clampedEnd = clamp(endMinutes, rangeStart, rangeEnd);
                          const totalRange = rangeEnd - rangeStart;
                          const top = ((clampedStart - rangeStart) / totalRange) * 100;
                          const minHeightRatio = (EVENT_MIN_HEIGHT_PX / GRID_HEIGHT) * 100;
                          const durationMinutes = Math.max(clampedEnd - clampedStart, 0);
                          const height = Math.max(
                            (durationMinutes / totalRange) * 100,
                            minHeightRatio
                          );
                          const pixelHeight = (height / 100) * GRID_HEIGHT;

                          return {
                            event,
                            segmentStart,
                            segmentEnd,
                            startMinutes,
                            endMinutes,
                            top,
                            height,
                            pixelHeight,
                            columnIndex: 0,
                            columnCount: 1,
                          };
                        })
                        .filter((segment): segment is TimedEventLayout => segment !== null)
                    ).map((layout) => {
                      const { event } = layout;
                      const ultraTinyEvent = layout.pixelHeight <= 15;
                      const tinyEvent = layout.pixelHeight <= 18;
                      const compactEvent = layout.pixelHeight <= 24;
                      const showTimeLine = layout.pixelHeight > 22;
                      const baseColor = event.calendarColor ?? "#3b82f6";
                      const borderColor = hexToRgba(baseColor, 0.62);
                      const backgroundColor = hexToRgba(
                        baseColor,
                        event.readOnly ? 0.2 : 0.25
                      );
                      const titleText = showTimeLine
                        ? event.title ?? "Call"
                        : `${event.title ?? "Call"}, ${formatTime(layout.segmentStart)}`;
                      const dynamicFontSize = ultraTinyEvent
                        ? "7.2px"
                        : tinyEvent
                        ? "7.7px"
                        : compactEvent
                        ? "8.5px"
                        : "9px";
                      const cardPadding = ultraTinyEvent
                        ? "0 4px"
                        : tinyEvent
                        ? "1px 5px"
                        : "2px 6px";
                      const sideInsetPx = 4;
                      const overlapGapPx = 2;
                      const widthPercent = 100 / layout.columnCount;
                      const leftPercent = widthPercent * layout.columnIndex;
                      const totalGapPx = Math.max(0, layout.columnCount - 1) * overlapGapPx;

                      return (
                        <button
                          type="button"
                          key={`${event.id}-${day.id}-${event.ownerEmail ?? "self"}`}
                          className="absolute rounded border text-left cursor-pointer calls-event-card"
                          style={{
                            top: `${layout.top}%`,
                            height: `${layout.height}%`,
                            left: `calc(${leftPercent}% + ${sideInsetPx}px + ${
                              layout.columnIndex * overlapGapPx
                            }px)`,
                            width: `calc(${widthPercent}% - ${sideInsetPx * 2}px - ${
                              totalGapPx / layout.columnCount
                            }px)`,
                            padding: cardPadding,
                            fontSize: dynamicFontSize,
                            lineHeight: ultraTinyEvent ? "1.05" : tinyEvent ? "1.12" : "1.08",
                            borderColor,
                            backgroundColor,
                            color: "rgba(226, 232, 240, 0.96)",
                            zIndex: 2 + layout.columnIndex,
                          }}
                          title={event.title ?? "Call"}
                          onClick={() => setSelectedEvent(event)}
                        >
                          <p className={`truncate ${tinyEvent ? "" : "font-medium"}`}>{titleText}</p>
                          {showTimeLine ? (
                            <p className="truncate text-slate-200/90">
                              {formatTime(layout.segmentStart)} - {formatTime(layout.segmentEnd)}
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              </div>
            </div>

            <button
              type="button"
              className="week-side-arrow"
              onClick={() => setWeekStart((prev) => addDays(prev, 7))}
              aria-label="Settimana successiva"
            >
              <Icon name="arrow-right" size={22} />
            </button>
          </div>
        </div>
      </main>
      {createEventOpen ? (
        <div
          className="modal-overlay calls-create-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Nuovo evento Google Calendar"
        >
          <div
            className="wizard-modal calls-create-wizard"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wizard-body">
              <div className="wizard-main">
                {createStep === 1 ? (
                  <div className="wizard-modal-header">
                    <div className="wizard-heading">
                      <h2 className="section-title">Che evento aggiungiamo?</h2>
                    </div>
                  </div>
                ) : null}

                <div className="wizard-step-nav" aria-label="Navigazione wizard evento">
                  {createStep > 1 ? (
                    <button
                      type="button"
                      className="week-side-arrow wizard-nav-arrow wizard-nav-arrow-left"
                      aria-label="Step precedente"
                      onClick={handleCreateStepBack}
                      disabled={createSubmitting}
                    >
                      <Icon name="arrow-left" size={22} />
                    </button>
                  ) : (
                    <span className="wizard-nav-spacer" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="week-side-arrow wizard-nav-arrow wizard-nav-arrow-right"
                    aria-label={createStep === 3 ? "Conferma evento" : "Step successivo"}
                    onClick={() => createEventFormRef.current?.requestSubmit()}
                    disabled={createSubmitting}
                  >
                    <Icon name={createStep === 3 ? "check" : "arrow-right"} size={22} />
                  </button>
                </div>

                <form
                  ref={createEventFormRef}
                  className={`wizard-modal-form calls-create-form calls-create-form-wizard calls-create-form-step-${createStep}`.trim()}
                  onSubmit={handleCreateEventSubmit}
                >
                  {createStep === 1 ? (
                    <div className="wizard-step calls-create-step">
                      <input
                        ref={createTitleInputRef}
                        type="text"
                        className={`glass-input wizard-title-input calls-create-input calls-create-title-input ${
                          createTitleInvalidFlash ? "is-invalid" : ""
                        }`.trim()}
                        value={createEventForm.title}
                        onChange={(event) =>
                          setCreateEventForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        placeholder="Titolo evento"
                        aria-label="Titolo evento"
                      />

                      <div className="calls-create-day-row">
                        <label className="calls-create-field calls-create-date-field">
                          <DatePicker
                            mode="multiple"
                            value={createEventForm.selectedDates}
                            onChange={(value) =>
                              setCreateEventForm((current) => ({
                                ...current,
                                selectedDates: value,
                              }))
                            }
                            onConfirm={(value) =>
                              setCreateEventForm((current) => ({
                                ...current,
                                selectedDates: value,
                              }))
                            }
                            confirmLabel="✓ Conferma"
                            placeholder="Seleziona giorno"
                            wrapperClassName="wizard-control-date calls-create-date-picker"
                            inputClassName="calls-create-input calls-create-input-center calls-create-date-input"
                            ariaLabel="Giorni evento"
                          />
                        </label>

                        <label className="calls-create-all-day-inline">
                          <span>Tutto il giorno</span>
                          <span className="calls-ios-toggle-wrap">
                            <input
                              type="checkbox"
                              className="calls-ios-toggle-input"
                              checked={createEventForm.isAllDay}
                              onChange={(event) =>
                                setCreateEventForm((current) => ({
                                  ...current,
                                  isAllDay: event.target.checked,
                                }))
                              }
                              aria-label="Attiva tutto il giorno"
                            />
                            <span className="calls-ios-toggle" aria-hidden="true">
                              <span className="calls-ios-toggle-knob" />
                            </span>
                          </span>
                        </label>
                      </div>

                      <div
                        className={`calls-create-time-panel ${
                          createEventForm.isAllDay ? "is-disabled" : ""
                        }`.trim()}
                      >
                        <div className="calls-create-time-row">
                          <CallsTimePicker
                            label="Inizio"
                            value={createEventForm.startTime}
                            onChange={(value) =>
                              setCreateEventForm((current) => ({
                                ...current,
                                startTime: value,
                                endTime: shiftQuarterHourTime(value, 2),
                              }))
                            }
                            disabled={createEventForm.isAllDay}
                          />
                          <span className="calls-create-time-separator">→</span>
                          <CallsTimePicker
                            label="Fine"
                            value={createEventForm.endTime}
                            onChange={(value) =>
                              setCreateEventForm((current) => ({
                                ...current,
                                endTime: value,
                              }))
                            }
                            disabled={createEventForm.isAllDay}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {createStep === 2 ? (
                    <div className="wizard-step calls-create-step">
                      <label className="calls-create-field">
                        <div className="calls-chip-field">
                          <input
                            type="text"
                            className="calls-chip-input"
                            value={createAttendeeInput}
                            onChange={(event) => {
                              setCreateAttendeeInput(event.target.value);
                              if (createAttendeeError) {
                                setCreateAttendeeError(null);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" ||
                                event.key === "," ||
                                event.key === ";" ||
                                event.key === "Tab"
                              ) {
                                event.preventDefault();
                                commitAttendeeInput();
                                return;
                              }
                              if (
                                event.key === "Backspace" &&
                                !createAttendeeInput &&
                                createEventForm.attendeeEmails.length > 0
                              ) {
                                event.preventDefault();
                                removeAttendeeEmail(
                                  createEventForm.attendeeEmails[
                                    createEventForm.attendeeEmails.length - 1
                                  ]
                                );
                              }
                            }}
                            onPaste={(event) => {
                              const text = event.clipboardData.getData("text");
                              if (!text || !/[,\s;]/.test(text)) return;
                              event.preventDefault();
                              commitAttendeeInput(text);
                            }}
                            placeholder="Partecipanti"
                            aria-label="Aggiungi partecipante"
                          />
                          {attendeeSuggestions.length > 0 ? (
                            <div className="calls-chip-suggestions">
                              {attendeeSuggestions.map((email) => (
                                <button
                                  key={email}
                                  type="button"
                                  className="calls-chip-suggestion"
                                  onClick={() => commitAttendeeInput(email)}
                                >
                                  <span className="calls-chip-suggestion-avatar" aria-hidden="true">
                                    {email.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span className="calls-chip-suggestion-email">{email}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {createEventForm.attendeeEmails.length > 0 ? (
                            <div className="calls-chip-list calls-chip-selected-list">
                              {createEventForm.attendeeEmails.map((email) => (
                                <span key={email} className="calls-chip-item">
                                  <span>{email}</span>
                                  <button
                                    type="button"
                                    className="calls-chip-remove"
                                    onClick={() => removeAttendeeEmail(email)}
                                    aria-label={`Rimuovi ${email}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </label>
                      {createAttendeeError ? (
                        <p className="wizard-inline-error">{createAttendeeError}</p>
                      ) : null}

                      <div className="calls-create-grid-two">
                        <IosToggleRow
                          label="Aggiungi Google Meet"
                          checked={createEventForm.addGoogleMeet}
                          onChange={(checked) =>
                            setCreateEventForm((current) => ({
                              ...current,
                              addGoogleMeet: checked,
                            }))
                          }
                        />

                        <label className="calls-create-field">
                          <Select
                            value={createEventForm.sendUpdates}
                            onChange={(value) =>
                              setCreateEventForm((current) => ({
                                ...current,
                                sendUpdates: value as CreateEventFormState["sendUpdates"],
                              }))
                            }
                            options={SEND_UPDATES_OPTIONS}
                            placeholder="Aggiornamenti inviti"
                            ariaLabel="Invio inviti"
                            className="wizard-control-select"
                            showToneDot={false}
                            maxVisibleOptions={6}
                          />
                        </label>
                      </div>

                      <label className="calls-create-field">
                        <span className="calls-create-label">Luogo</span>
                        <input
                          type="text"
                          className="glass-input calls-create-input"
                          value={createEventForm.location}
                          onChange={(event) =>
                            setCreateEventForm((current) => ({
                              ...current,
                              location: event.target.value,
                            }))
                          }
                          placeholder="Link o indirizzo"
                        />
                      </label>

                      <label className="calls-create-field">
                        <span className="calls-create-label">Descrizione</span>
                        <textarea
                          className="glass-input calls-create-textarea"
                          value={createEventForm.description}
                          onChange={(event) =>
                            setCreateEventForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Dettagli, agenda, note..."
                          rows={4}
                        />
                      </label>
                    </div>
                  ) : null}

                  {createStep === 3 ? (
                    <div className="wizard-step calls-create-step">
                      <label className="calls-create-field">
                        <span className="calls-create-label">Visibilità</span>
                        <Select
                          value={createEventForm.visibility}
                          onChange={(value) =>
                            setCreateEventForm((current) => ({
                              ...current,
                              visibility: value as CreateEventFormState["visibility"],
                            }))
                          }
                          options={VISIBILITY_OPTIONS}
                          placeholder="Visibilità"
                          className="wizard-control-select"
                          showToneDot={false}
                        />
                      </label>

                      <IosToggleRow
                        label="Invitati possono invitare altri"
                        checked={createEventForm.guestsCanInviteOthers}
                        onChange={(checked) =>
                          setCreateEventForm((current) => ({
                            ...current,
                            guestsCanInviteOthers: checked,
                          }))
                        }
                      />

                      <IosToggleRow
                        label="Invitati vedono altri partecipanti"
                        checked={createEventForm.guestsCanSeeOtherGuests}
                        onChange={(checked) =>
                          setCreateEventForm((current) => ({
                            ...current,
                            guestsCanSeeOtherGuests: checked,
                          }))
                        }
                      />

                      <IosToggleRow
                        label="Invitati possono modificare evento"
                        checked={createEventForm.guestsCanModify}
                        onChange={(checked) =>
                          setCreateEventForm((current) => ({
                            ...current,
                            guestsCanModify: checked,
                          }))
                        }
                      />

                      <IosToggleRow
                        label="Reminder di default calendario"
                        checked={createEventForm.useDefaultReminders}
                        onChange={(checked) =>
                          setCreateEventForm((current) => ({
                            ...current,
                            useDefaultReminders: checked,
                          }))
                        }
                      />

                      {!createEventForm.useDefaultReminders ? (
                        <label className="calls-create-field">
                          <span className="calls-create-label">Reminder personalizzati (minuti)</span>
                          <input
                            type="text"
                            className="glass-input calls-create-input"
                            value={createEventForm.reminderMinutesText}
                            onChange={(event) =>
                              setCreateEventForm((current) => ({
                                ...current,
                                reminderMinutesText: event.target.value,
                              }))
                            }
                            placeholder="10,30,60"
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  {createError ? <p className="wizard-inline-error">{createError}</p> : null}

                  <div className="wizard-type-row calls-create-actions-row">
                    <button
                      type="button"
                      className="wizard-cancel-link"
                      onClick={closeCreateEventModal}
                      disabled={createSubmitting}
                    >
                      Annulla
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedEvent ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Dettaglio call"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="app-confirm-dialog calls-event-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="app-confirm-title">{selectedEvent.title ?? "Call senza titolo"}</p>
            <p className="app-confirm-body">
              {selectedEvent.is_all_day
                ? "Evento giornaliero"
                : selectedEventStart
                ? `${new Intl.DateTimeFormat("it-IT", {
                    weekday: "long",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(selectedEventStart)} · ${formatTime(selectedEventStart)}${
                    selectedEventEnd ? ` - ${formatTime(selectedEventEnd)}` : ""
                  }`
                : "Orario non disponibile"}
            </p>
            {selectedEvent.description ? (
              <p className="meta-line">{selectedEvent.description}</p>
            ) : null}
            <div className="calls-attendees">
              <p className="calls-attendees-title">Partecipanti</p>
              {selectedEventAttendees.length === 0 ? (
                <p className="meta-line">Nessun partecipante disponibile</p>
              ) : (
                <ul className="calls-attendees-list">
                  {selectedEventAttendees.map((attendee, index) => (
                    <li
                      key={`${attendee.email ?? attendee.displayName ?? "att"}-${index}`}
                      className={attendeeStatusClass(attendee._status)}
                    >
                      {attendee.email || attendee.displayName || "Partecipante"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!selectedEventIsReadOnly ? (
              <>
            <div className="calls-rsvp-row">
              <button
                type="button"
                className={`calls-rsvp-btn calls-rsvp-btn-accepted ${
                  selectedSelfRsvpStatus === "accepted" ? "calls-rsvp-btn-active" : ""
                } ${
                  selectedSelfRsvpStatus && selectedSelfRsvpStatus !== "accepted"
                    ? "calls-rsvp-btn-muted"
                    : ""
                }`}
                onClick={() => void handleRsvp("accepted")}
                disabled={rsvpUpdating !== null}
              >
                {rsvpUpdating === "accepted"
                  ? "..."
                  : selectedSelfRsvpStatus === "accepted"
                  ? "✓ Accetta"
                  : "Accetta"}
              </button>
              <button
                type="button"
                className={`calls-rsvp-btn calls-rsvp-btn-tentative ${
                  selectedSelfRsvpStatus === "tentative" ? "calls-rsvp-btn-active" : ""
                } ${
                  selectedSelfRsvpStatus && selectedSelfRsvpStatus !== "tentative"
                    ? "calls-rsvp-btn-muted"
                    : ""
                }`}
                onClick={() => void handleRsvp("tentative")}
                disabled={rsvpUpdating !== null}
              >
                {rsvpUpdating === "tentative"
                  ? "..."
                  : selectedSelfRsvpStatus === "tentative"
                  ? "✓ Forse"
                  : "Forse"}
              </button>
              <button
                type="button"
                className={`calls-rsvp-btn calls-rsvp-btn-declined ${
                  selectedSelfRsvpStatus === "declined" ? "calls-rsvp-btn-active" : ""
                } ${
                  selectedSelfRsvpStatus && selectedSelfRsvpStatus !== "declined"
                    ? "calls-rsvp-btn-muted"
                    : ""
                }`}
                onClick={() => void handleRsvp("declined")}
                disabled={rsvpUpdating !== null}
              >
                {rsvpUpdating === "declined"
                  ? "..."
                  : selectedSelfRsvpStatus === "declined"
                  ? "✓ Rifiuta"
                  : "Rifiuta"}
              </button>
            </div>
            {rsvpError ? <p className="meta-line meta-line-alert">{rsvpError}</p> : null}
            <div className="calls-event-tools">
              <button
                type="button"
                className="calls-event-tool-btn"
                onClick={() => {
                  setEventEditForm(getDefaultEventEditFormState(selectedEvent));
                  setEventEditOpen((current) => !current);
                  setEventMutationError(null);
                }}
                disabled={eventMutationState !== null}
                title="Modifica evento"
                aria-label="Modifica evento"
              >
                <Icon name="edit" size={15} />
              </button>
              <button
                type="button"
                className="calls-event-tool-btn"
                onClick={() => void handleAddAttendeeToSelectedEvent()}
                disabled={eventMutationState !== null}
                title="Aggiungi partecipante"
                aria-label="Aggiungi partecipante"
              >
                <Icon name="user-plus" size={15} />
              </button>
              <button
                type="button"
                className="calls-event-tool-btn is-danger"
                onClick={() => void handleDeleteSelectedEvent()}
                disabled={eventMutationState !== null}
                title="Elimina evento"
                aria-label="Elimina evento"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            {eventEditOpen && eventEditForm ? (
              <form className="calls-event-edit-form" onSubmit={handleEventSave}>
                <label className="calls-event-edit-field">
                  <span className="calls-event-edit-label">Titolo</span>
                  <input
                    type="text"
                    className="glass-input calls-create-input"
                    value={eventEditForm.title}
                    onChange={(event) =>
                      setEventEditForm((current) =>
                        current
                          ? {
                              ...current,
                              title: event.target.value,
                            }
                          : current
                      )
                    }
                    required
                  />
                </label>

                <label className="calls-event-edit-field">
                  <span className="calls-event-edit-label">Descrizione</span>
                  <textarea
                    className="glass-input calls-create-textarea"
                    value={eventEditForm.description}
                    onChange={(event) =>
                      setEventEditForm((current) =>
                        current
                          ? {
                              ...current,
                              description: event.target.value,
                            }
                          : current
                      )
                    }
                    rows={3}
                  />
                </label>

                <label className="calls-event-edit-toggle">
                  <input
                    type="checkbox"
                    checked={eventEditForm.isAllDay}
                    onChange={(event) =>
                      setEventEditForm((current) =>
                        current
                          ? {
                              ...current,
                              isAllDay: event.target.checked,
                            }
                          : current
                      )
                    }
                  />
                  <span>Tutto il giorno</span>
                </label>

                <div className="calls-event-edit-grid">
                  <label className="calls-event-edit-field">
                    <span className="calls-event-edit-label">Data inizio</span>
                    <input
                      type="date"
                      className="glass-input calls-create-input"
                      value={eventEditForm.startDate}
                      onChange={(event) =>
                        setEventEditForm((current) =>
                          current
                            ? {
                                ...current,
                                startDate: event.target.value,
                              }
                            : current
                        )
                      }
                      required
                    />
                  </label>
                  <label className="calls-event-edit-field">
                    <span className="calls-event-edit-label">Data fine</span>
                    <input
                      type="date"
                      className="glass-input calls-create-input"
                      value={eventEditForm.endDate}
                      onChange={(event) =>
                        setEventEditForm((current) =>
                          current
                            ? {
                                ...current,
                                endDate: event.target.value,
                              }
                            : current
                        )
                      }
                      required
                    />
                  </label>
                  {!eventEditForm.isAllDay ? (
                    <>
                      <label className="calls-event-edit-field">
                        <span className="calls-event-edit-label">Ora inizio</span>
                        <input
                          type="time"
                          step={900}
                          className="glass-input calls-time-input"
                          value={eventEditForm.startTime}
                          onChange={(event) =>
                            setEventEditForm((current) =>
                              current
                                ? {
                                    ...current,
                                    startTime: event.target.value,
                                  }
                                : current
                            )
                          }
                          required
                        />
                      </label>
                      <label className="calls-event-edit-field">
                        <span className="calls-event-edit-label">Ora fine</span>
                        <input
                          type="time"
                          step={900}
                          className="glass-input calls-time-input"
                          value={eventEditForm.endTime}
                          onChange={(event) =>
                            setEventEditForm((current) =>
                              current
                                ? {
                                    ...current,
                                    endTime: event.target.value,
                                  }
                                : current
                            )
                          }
                          required
                        />
                      </label>
                    </>
                  ) : null}
                </div>

                <div className="calls-event-edit-actions">
                  <button
                    type="button"
                    className="btn-tertiary px-3 py-2 text-sm"
                    onClick={() => setEventEditOpen(false)}
                    disabled={eventMutationState !== null}
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="btn-primary px-3 py-2 text-sm"
                    disabled={eventMutationState !== null}
                  >
                    {eventMutationState === "saving" ? "Salvataggio..." : "Salva modifiche"}
                  </button>
                </div>
              </form>
            ) : null}
            {eventMutationError ? (
              <p className="meta-line meta-line-alert">{eventMutationError}</p>
            ) : null}
              </>
            ) : (
              <p className="meta-line">Calendario collega (sola lettura).</p>
            )}
            <div className="app-confirm-actions">
              <button
                type="button"
                className="btn-tertiary px-4 py-2 text-sm"
                onClick={() => setSelectedEvent(null)}
              >
                Chiudi
              </button>
              {selectedEvent.meeting_url ? (
                <a
                  href={selectedEvent.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary px-4 py-2 text-sm calls-open-meet-btn"
                >
                  Apri Meet
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
