"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { addDays, formatISODate, startOfWeek, todayISO } from "@/lib/tasks";

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
    href: "/inbox",
    label: "📥 Cattura",
    hint: "Inbox",
    desc: "Raccogli tutto in un punto.",
    key: "inbox",
  },
  {
    href: "/week",
    label: "🗓️ Pianifica",
    hint: "Settimana",
    desc: "Distribuisci i task sui giorni.",
    key: "week",
  },
  {
    href: "/today",
    label: "☀️ Oggi",
    hint: "Focus",
    desc: "Seleziona cosa chiudere ora.",
    key: "today",
  },
  {
    href: "/all",
    label: "🔎 Rivedi",
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
  if (pathname.startsWith("/inbox") || pathname.startsWith("/new")) {
    return "/inbox";
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
  const pathname = usePathname();
  const activeFlow = resolveActiveFlow(pathname);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
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
        setSessionState(session ? "authed" : "anon");
      })
      .catch(() => {
        if (!active) return;
        setSessionState("anon");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authed") {
      setSummary(null);
      return;
    }

    let active = true;

    async function loadSummary() {
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

      if (!active) return;

      setSummary({
        inbox: inboxRes.count ?? 0,
        today: todayRes.count ?? 0,
        week: weekRes.count ?? 0,
        overdue: overdueRes.count ?? 0,
        projects: projectsRes.count ?? 0,
      });
    }

    loadSummary();

    return () => {
      active = false;
    };
  }, [sessionState]);

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
        </nav>
      </div>
    </div>
  );
}
