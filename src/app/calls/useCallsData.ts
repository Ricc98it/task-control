"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureSession } from "@/lib/autoSession";
import { addDays } from "@/lib/tasks";
import { supabase } from "@/lib/supabaseClient";
import type { CalendarAttendee, CalendarEvent, GoogleStatus } from "@/app/calls/types";
import { asDate, getColorForEmail, normalizeEmail } from "@/app/calls/utils";

type UseCallsDataParams = {
  weekStart: Date;
};

export function useCallsData({ weekStart }: UseCallsDataParams) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [colleagueEvents, setColleagueEvents] = useState<CalendarEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [, setStatus] = useState<GoogleStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [, setErr] = useState<string | null>(null);
  const [knownAttendeeEmails, setKnownAttendeeEmails] = useState<string[]>([]);
  const [colleagueInput, setColleagueInput] = useState("");
  const [colleagueSuggestions, setColleagueSuggestions] = useState<string[]>([]);
  const [colleagueSelectedEmails, setColleagueSelectedEmails] = useState<string[]>([]);
  const [, setColleagueLoadingSuggestions] = useState(false);
  const [, setColleagueLoadingEvents] = useState(false);
  const [colleagueError, setColleagueError] = useState<string | null>(null);
  const autoSyncDoneRef = useRef(false);

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

    if (error) return;

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

  const loadStatus = useCallback(async (accessToken: string) => {
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
  }, []);

  const runSync = useCallback(async (accessToken: string, forceFullSync = false) => {
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
  }, []);

  const refreshPageData = useCallback(async () => {
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
      if (integrationStatus.connected && !autoSyncDoneRef.current) {
        setSyncing(true);
        try {
          await runSync(accessToken, false);
          autoSyncDoneRef.current = true;
          await loadStatus(accessToken);
        } finally {
          setSyncing(false);
        }
      }

      await loadEvents();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore caricamento call.");
    }
  }, [getAccessToken, loadEvents, loadStatus, runSync]);

  useEffect(() => {
    void refreshPageData();
  }, [refreshPageData]);

  const handleManualSync = useCallback(async () => {
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
  }, [getAccessToken, loadEvents, loadStatus, runSync]);

  const loadColleagueSuggestions = useCallback(
    async (query: string) => {
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
    },
    [colleagueSelectedEmails, getAccessToken]
  );

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

  const addColleagueEmail = useCallback((email: string) => {
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
  }, []);

  const removeColleagueEmail = useCallback((email: string) => {
    setColleagueSelectedEmails((current) => current.filter((item) => item !== email));
  }, []);

  const mergedEvents = useMemo(
    () => [...events, ...colleagueEvents],
    [colleagueEvents, events]
  );

  return {
    connected,
    syncing,
    events,
    setEvents,
    colleagueEvents,
    setColleagueEvents,
    mergedEvents,
    knownAttendeeEmails,
    loadKnownAttendeeEmails,
    getAccessToken,
    loadEvents,
    loadStatus,
    runSync,
    handleManualSync,
    colleagueInput,
    setColleagueInput,
    colleagueSuggestions,
    colleagueSelectedEmails,
    colleagueError,
    setColleagueError,
    addColleagueEmail,
    removeColleagueEmail,
  };
}
