export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string | null;
  tokenType: string | null;
};

export type GoogleCalendarEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  htmlLink?: string;
  updated?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  attendees?: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
    organizer?: boolean;
    optional?: boolean;
    self?: boolean;
  }>;
  conferenceData?: {
    conferenceSolution?: {
      key?: { type?: string };
      name?: string;
    };
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
      label?: string;
    }>;
  };
};

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type GooglePrimaryCalendar = {
  id?: string;
  summary?: string;
};

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class GoogleApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
  };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchGoogleJson<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await parseJsonSafe(response);
    throw new GoogleApiError(
      `Google API request failed with status ${response.status}.`,
      response.status,
      body
    );
  }
  return (await response.json()) as T;
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DEFAULT_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(
  code: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const response = await fetchGoogleJson<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  }>(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresIn: response.expires_in,
    scope: response.scope ?? null,
    tokenType: response.token_type ?? null,
  };
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  const response = await fetchGoogleJson<{
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  }>(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  return {
    accessToken: response.access_token,
    refreshToken,
    expiresIn: response.expires_in,
    scope: response.scope ?? null,
    tokenType: response.token_type ?? null,
  };
}

export async function fetchGooglePrimaryCalendar(
  accessToken: string
): Promise<{ calendarId: string; summary: string | null }> {
  const response = await fetchGoogleJson<GooglePrimaryCalendar>(
    `${GOOGLE_CALENDAR_BASE_URL}/users/me/calendarList/primary`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return {
    calendarId: response.id ?? "primary",
    summary: response.summary ?? null,
  };
}

export async function listGoogleCalendarEvents(options: {
  accessToken: string;
  calendarId: string;
  pageToken?: string;
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
}): Promise<{
  items: GoogleCalendarEvent[];
  nextPageToken: string | null;
  nextSyncToken: string | null;
}> {
  const url = new URL(
    `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(options.calendarId)}/events`
  );

  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");

  if (options.syncToken) {
    url.searchParams.set("syncToken", options.syncToken);
  } else {
    if (options.timeMin) {
      url.searchParams.set("timeMin", options.timeMin);
    }
    if (options.timeMax) {
      url.searchParams.set("timeMax", options.timeMax);
    }
    url.searchParams.set("orderBy", "startTime");
  }

  if (options.pageToken) {
    url.searchParams.set("pageToken", options.pageToken);
  }

  const response = await fetchGoogleJson<GoogleEventsListResponse>(url.toString(), {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
    },
  });

  return {
    items: response.items ?? [],
    nextPageToken: response.nextPageToken ?? null,
    nextSyncToken: response.nextSyncToken ?? null,
  };
}

