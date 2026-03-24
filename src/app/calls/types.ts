export type CalendarAttendee = {
  email?: string | null;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
  optional?: boolean;
  self?: boolean;
};

export type CalendarEvent = {
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

export type GoogleStatus = {
  connected: boolean;
  provider: "GOOGLE";
  providerAccountEmail?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
};

export type CreateEventFormState = {
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

export type CreateEventStep = 1 | 2 | 3;
export type EventMutationState = null | "saving" | "deleting" | "addingAttendee";

export type EventEditFormState = {
  title: string;
  description: string;
  isAllDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export type AttendeeStatusGroup = "accepted" | "tentative" | "declined" | "needsAction";
export type RsvpStatus = Exclude<AttendeeStatusGroup, "needsAction">;

export type TimedEventLayout = {
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
