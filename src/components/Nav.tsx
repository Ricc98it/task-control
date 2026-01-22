"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { addDays, formatISODate, startOfWeek, todayISO } from "@/lib/tasks";
import { onTasksUpdated } from "@/lib/taskEvents";

type SessionState = "loading" | "authed" | "anon";
type SummaryKey = "inbox" | "today" | "week" | "overdue" | "projects";
type FlowCard = {
  href: string;
  label: string;
  hint: string;
  desc: string;
  key?: SummaryKey;
  variant?: "home";
};

const flowBoard: FlowCard[] = [
  {
    href: "/",
    label: "🏠 Home",
    hint: "Start",
    desc: "Panoramica generale.",
    variant: "home",
  },
  {
    href: "/today",
    label: "☀️ Oggi",
    hint: "Focus",
    desc: "Seleziona cosa chiudere ora.",
    key: "today",
  },
  {
    href: "/week",
    label: "🗓️ Pianifica",
    hint: "Settimana",
    desc: "Distribuisci i task sui giorni.",
    key: "week",
  },
  {
    href: "/all",
    label: "📋 Task",
    hint: "Task",
    desc: "Controlla tutto il carico.",
    key: "overdue",
  },
  {
    href: "/projects",
    label: "🗂️ Progetti",
    hint: "Spazi",
    desc: "Organizza i tuoi contenitori.",
    key: "projects",
  },
];

function resolveActiveFlow(pathname: string | null) {
  if (!pathname) return null;
  if (pathname === "/") {
    return "/";
  }
  if (pathname.startsWith("/week")) {
    return "/week";
  }
  if (pathname.startsWith("/today")) {
    return "/today";
  }
  if (
    pathname.startsWith("/all") ||
    pathname.startsWith("/done") ||
    pathname.startsWith("/task")
  ) {
    return "/all";
  }
  if (pathname.startsWith("/projects")) {
    return "/projects";
  }
  return null;
}

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const activeFlow = resolveActiveFlow(pathname);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [loggingOut, setLoggingOut] = useState(false);
  const [summary, setSummary] = useState<{
    inbox: number;
    today: number;
    week: number;
    overdue: number;
    projects: number;
  } | null>(null);

  useEffect(() => {
    let active = true;

    ensureSession()
      .then((session) => {
        if (!active) return;
        if (!session) {
          setSessionState("anon");
          router.replace("/login");
          return;
        }
        setSessionState("authed");
      })
      .catch(() => {
        if (!active) return;
        setSessionState("anon");
        router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [router]);

  const loadSummary = useCallback(async () => {
    const weekStart = startOfWeek(new Date());
    const weekDays = Array.from({ length: 7 }, (_, index) =>
      formatISODate(addDays(weekStart, index))
    );
    const today = todayISO();

    const [inboxRes, todayRes, weekRes, overdueRes, projectsRes] =
      await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "INBOX"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "OPEN")
        .contains("work_days", [today]),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "OPEN")
        .overlaps("work_days", weekDays),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["OPEN", "INBOX"]),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true }),
    ]);

    return {
      inbox: inboxRes.count ?? 0,
      today: todayRes.count ?? 0,
      week: weekRes.count ?? 0,
      overdue: overdueRes.count ?? 0,
      projects: projectsRes.count ?? 0,
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authed") {
      setSummary(null);
      return;
    }

    let active = true;
    loadSummary()
      .then((next) => {
        if (!active) return;
        setSummary(next);
      })
      .catch(() => {
        if (!active) return;
        setSummary({
          inbox: 0,
          today: 0,
          week: 0,
          overdue: 0,
          projects: 0,
        });
      });

    return () => {
      active = false;
    };
  }, [loadSummary, sessionState]);

  useEffect(() => {
    if (sessionState !== "authed") return;
    return onTasksUpdated(() => {
      loadSummary()
        .then((next) => setSummary(next))
        .catch(() => {});
    });
  }, [loadSummary, sessionState]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const { error } = await supabase.auth.signOut();
    setLoggingOut(false);
    if (error) {
      console.error(error);
      return;
    }
    setSessionState("anon");
    router.replace("/login");
  }

  return (
    <div className="sticky top-0 z-20">
      <div className="nav-shell">
        <nav className="nav-board">
          {flowBoard.map((item) => {
            const count = item.key ? summary?.[item.key] ?? 0 : 0;
            const isAlert = item.key === "overdue" && count > 0;
            const isActive = activeFlow === item.href;
            if (item.variant === "home") {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-label="Home"
                  className={
                    "flow-card flow-card-home " +
                    (isActive ? "flow-card-active" : "")
                  }
                >
                  <span className="flow-card-home-emoji">🏠</span>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  "flow-card " +
                  (item.variant === "home" ? "flow-card-home " : "") +
                  (isAlert ? "border-rose-400/40 " : "") +
                  (isActive ? "flow-card-active" : "")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flow-card-label">{item.label}</span>
                  <span className="flow-card-hint">{item.hint}</span>
                </div>
                {sessionState === "authed" && item.key ? (
                  <span
                    className={
                      "flow-card-count " + (isAlert ? "text-rose-200" : "")
                    }
                  >
                    {count}
                  </span>
                ) : (
                  <span className="flow-card-desc">{item.desc}</span>
                )}
              </Link>
            );
          })}
          {sessionState === "authed" && (
            <div className="nav-logout">
              <button
                type="button"
                className="flow-card flow-card-home nav-logout-button"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-label="Logout"
                title="Logout"
              >
                <span className="flow-card-home-emoji">
                  {loggingOut ? "⏳" : "🚪"}
                </span>
              </button>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
