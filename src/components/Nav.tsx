"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import TaskWizardModal from "@/components/TaskWizardModal";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { onTasksUpdated } from "@/lib/taskEvents";

type SessionState = "loading" | "authed" | "anon";
type SummaryKey = "inbox" | "overdue" | "projects";
type FlowCard = {
  href: string;
  label: string;
  key?: SummaryKey;
  variant?: "home";
};

const flowBoard: FlowCard[] = [
  {
    href: "/",
    label: "🏠 Home",
    variant: "home",
  },
  {
    href: "/all",
    label: "Task",
    key: "overdue",
  },
  {
    href: "/projects",
    label: "Progetti",
    key: "projects",
  },
];

function resolveActiveFlow(pathname: string | null) {
  if (!pathname) return null;
  if (pathname === "/") {
    return "/";
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
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [taskCreatedOverlayVisible, setTaskCreatedOverlayVisible] = useState(false);
  const taskCreatedOverlayTimerRef = useRef<number | null>(null);
  const [summary, setSummary] = useState<{
    inbox: number;
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
    const [inboxRes, overdueRes, projectsRes] =
      await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "INBOX"),
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
      overdue: overdueRes.count ?? 0,
      projects: projectsRes.count ?? 0,
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authed") return;

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

  const showTaskCreatedOverlay = useCallback(() => {
    setTaskCreatedOverlayVisible(true);
    if (taskCreatedOverlayTimerRef.current !== null) {
      window.clearTimeout(taskCreatedOverlayTimerRef.current);
    }
    taskCreatedOverlayTimerRef.current = window.setTimeout(() => {
      setTaskCreatedOverlayVisible(false);
      taskCreatedOverlayTimerRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (taskCreatedOverlayTimerRef.current !== null) {
        window.clearTimeout(taskCreatedOverlayTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!logoutConfirmOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !loggingOut) {
        setLogoutConfirmOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [logoutConfirmOpen, loggingOut]);

  return (
    <>
      <div className="sticky top-0 z-20">
        <div className="nav-shell">
          <div className="nav-layout">
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
                      "flow-card flow-card-main " +
                      (item.variant === "home" ? "flow-card-home " : "") +
                      (isAlert ? "border-rose-400/40 " : "") +
                      (isActive ? "flow-card-active" : "")
                    }
                  >
                    <span className="flow-card-section">{item.label}</span>
                    <span
                      className={
                        "flow-card-metric " +
                        (isAlert ? "text-rose-200" : "") +
                        (sessionState === "authed" ? "" : " flow-card-metric-muted")
                      }
                    >
                      {sessionState === "authed" && item.key ? count : "-"}
                    </span>
                  </Link>
                );
              })}
              {sessionState === "authed" && (
                <div className="nav-logout">
                  <button
                    type="button"
                    className="flow-card flow-card-home nav-logout-button"
                    onClick={() => setLogoutConfirmOpen(true)}
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
            {sessionState === "authed" && (
              <div className="nav-cta">
                <button
                  type="button"
                  className="nav-add-button"
                  onClick={() => {
                    setWizardKey((prev) => prev + 1);
                    setWizardOpen(true);
                  }}
                  aria-label="Aggiungi task"
                  title="Aggiungi task"
                >
                  <span className="nav-add-plus">+</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <TaskWizardModal
        key={wizardKey}
        open={sessionState === "authed" && wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={showTaskCreatedOverlay}
      />
      {taskCreatedOverlayVisible ? (
        <div className="task-created-overlay" role="status" aria-live="polite">
          <p className="task-created-overlay-text">Task aggiunto</p>
        </div>
      ) : null}
      {logoutConfirmOpen ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Conferma logout"
          onClick={() => setLogoutConfirmOpen(false)}
        >
          <div
            className="app-confirm-dialog logout-confirm-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="app-confirm-title logout-confirm-title">Confermi logout?</p>
            <p className="app-confirm-body logout-confirm-body">
              Uscirai dalla sessione corrente.
            </p>
            <div className="app-confirm-actions logout-confirm-actions">
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={() => setLogoutConfirmOpen(false)}
                disabled={loggingOut}
              >
                Annulla
              </button>
              <button
                type="button"
                className="logout-confirm-btn logout-confirm-btn-danger"
                onClick={() => {
                  setLogoutConfirmOpen(false);
                  void handleLogout();
                }}
                disabled={loggingOut}
              >
                {loggingOut ? "Esco..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
