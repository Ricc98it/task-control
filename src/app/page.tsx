"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type TouchEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import DatePicker from "@/components/DatePicker";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import Nav from "@/components/Nav";
import SkeletonList from "@/components/SkeletonList";
import TaskEditModal from "@/components/TaskEditModal";
import { ensureSession } from "@/lib/autoSession";
import { getHomeContextHints } from "@/lib/contextHints";
import { emitTasksUpdated, onTasksUpdated } from "@/lib/taskEvents";
import { supabase } from "@/lib/supabaseClient";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  addDays,
  formatDisplayDate,
  formatISODate,
  getPriorityMeta,
  getTypeMeta,
  normalizeTasks,
  startOfWeek,
  todayISO,
  type Project,
  type Task,
} from "@/lib/tasks";

type SessionState = "loading" | "authed" | "anon";

type Profile = {
  user_id: string;
  email: string;
  full_name: string;
};

type DropTarget = { id: string; label: string; date: string };
const DRAG_TYPE_TASK = "application/x-task-control-task";
const DRAG_TYPE_DEADLINE = "application/x-task-control-deadline";
const DEADLINE_PREFIX = "deadline:";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDraggedTaskId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const stripped = value.startsWith(DEADLINE_PREFIX)
    ? value.slice(DEADLINE_PREFIX.length)
    : value;
  if (UUID_REGEX.test(stripped)) return stripped;

  const match = /\/task\/([0-9a-f-]{36})(?:$|[/?#])/i.exec(value);
  if (!match?.[1]) return null;
  return UUID_REGEX.test(match[1]) ? match[1] : null;
}

function priorityRank(priority: Task["priority"]): number {
  if (priority === "P0") return 0;
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  return 4;
}

function formatNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (!local) return email;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return local;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveUserName(user: User | null): string | null {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  const metaName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
      ? metadata.name
      : null;
  if (metaName && metaName.trim()) return metaName.trim();
  if (user.email) return formatNameFromEmail(user.email);
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskActionTarget, setTaskActionTarget] = useState<Task | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [taskCompletedOverlayVisible, setTaskCompletedOverlayVisible] = useState(false);
  const [homeContextHint, setHomeContextHint] = useState(
    "Sto aggiornando le informazioni utili per oggi..."
  );
  const [loadingPlanning, setLoadingPlanning] = useState(true);
  const [planningErr, setPlanningErr] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(() => {
    const day = new Date().getDay();
    if (day === 0 || day === 6) return 4;
    return Math.min(4, Math.max(0, day - 1));
  });
  const [movingTaskTarget, setMovingTaskTarget] = useState<Task | null>(null);
  const [movingTaskWorkingDays, setMovingTaskWorkingDays] = useState<string[]>([]);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [movingDeadlineTarget, setMovingDeadlineTarget] = useState<Task | null>(null);
  const [movingDeadlineDate, setMovingDeadlineDate] = useState("");
  const [movingDeadlineId, setMovingDeadlineId] = useState<string | null>(null);
  const dropHandledRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const draggingFromRef = useRef<string | null>(null);
  const taskCompletedOverlayTimerRef = useRef<number | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const taskLongPressTimerRef = useRef<number | null>(null);
  const deadlineLongPressTimerRef = useRef<number | null>(null);
  const consumeTaskClickRef = useRef<string | null>(null);
  const consumeDeadlineClickRef = useRef<string | null>(null);
  const today = useMemo(() => todayISO(), []);

  const days = useMemo<DropTarget[]>(() => {
    const labels = ["Lun", "Mar", "Mer", "Gio", "Ven"];
    return labels.map((label, index) => {
      const date = addDays(weekStart, index);
      return {
        id: formatISODate(date),
        label,
        date: formatISODate(date),
      };
    });
  }, [weekStart]);

  const deadlinesByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    deadlines.forEach((task) => {
      const due = task.due_date ? task.due_date.slice(0, 10) : null;
      if (!due) return;
      const list = map.get(due) ?? [];
      list.push(task);
      map.set(due, list);
    });
    return map;
  }, [deadlines]);
  const activeDay = days[activeDayIndex] ?? days[0] ?? null;

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const session = await ensureSession();
        if (!active) return;
        if (!session) {
          setSessionState("anon");
          setSessionUser(null);
          setUserName(null);
          router.replace("/login");
          return;
        }
        setSessionState("authed");
        setSessionUser(session.user ?? null);
        setUserName(resolveUserName(session.user ?? null));
      } catch {
        if (!active) return;
        setSessionState("anon");
        setSessionUser(null);
        setUserName(null);
        router.replace("/login");
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (sessionState !== "authed" || !sessionUser) return;
    let active = true;
    setProfileLoading(true);
    setProfileChecked(false);

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id,full_name,email")
          .eq("user_id", sessionUser.id)
          .maybeSingle();

        if (!active) return;
        if (error) console.error(error);

        setProfile(
          data
            ? {
                user_id: data.user_id,
                email: data.email,
                full_name: data.full_name,
              }
            : null
        );
      } catch {
        if (!active) return;
        setProfile(null);
      } finally {
        if (!active) return;
        setProfileLoading(false);
        setProfileChecked(true);
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [sessionState, sessionUser]);

  const loadPlanningData = useCallback(async () => {
    const weekStartISO = formatISODate(weekStart);
    const weekEndISO = formatISODate(addDays(weekStart, 4));

    const [plannedRes, deadlineRes, projectsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
        )
        .eq("status", "OPEN")
        .overlaps(
          "work_days",
          Array.from({ length: 5 }, (_, index) =>
            formatISODate(addDays(weekStart, index))
          )
        )
        .order("work_days", { ascending: true })
        .order("priority", { ascending: true, nullsFirst: false }),
      supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
        )
        .neq("status", "DONE")
        .not("due_date", "is", null)
        .gte("due_date", weekStartISO)
        .lte("due_date", weekEndISO)
        .order("due_date", { ascending: true })
        .order("priority", { ascending: true, nullsFirst: false }),
      supabase.from("projects").select("id,name,type").order("name"),
    ]);

    if (plannedRes.error || deadlineRes.error || projectsRes.error) {
      const message =
        plannedRes.error?.message ??
        deadlineRes.error?.message ??
        projectsRes.error?.message ??
        "Errore nel caricamento della settimana.";
      setPlanningErr(message);
    } else {
      setPlanningErr(null);
    }

    setTasks(normalizeTasks(plannedRes.data ?? []));
    setDeadlines(normalizeTasks(deadlineRes.data ?? []));
    setProjects((projectsRes.data ?? []) as Project[]);
  }, [weekStart]);

  useEffect(() => {
    if (sessionState !== "authed") return;

    let active = true;
    setLoadingPlanning(true);

    loadPlanningData()
      .catch((error) => {
        if (!active) return;
        setPlanningErr(
          error instanceof Error ? error.message : "Errore nel caricamento."
        );
        setTasks([]);
        setDeadlines([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingPlanning(false);
      });

    return () => {
      active = false;
    };
  }, [loadPlanningData, sessionState]);

  const showTaskCompletedOverlay = useCallback(() => {
    setTaskCompletedOverlayVisible(true);
    if (taskCompletedOverlayTimerRef.current !== null) {
      window.clearTimeout(taskCompletedOverlayTimerRef.current);
    }
    taskCompletedOverlayTimerRef.current = window.setTimeout(() => {
      setTaskCompletedOverlayVisible(false);
      taskCompletedOverlayTimerRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (taskCompletedOverlayTimerRef.current !== null) {
        window.clearTimeout(taskCompletedOverlayTimerRef.current);
      }
      if (taskLongPressTimerRef.current !== null) {
        window.clearTimeout(taskLongPressTimerRef.current);
      }
      if (deadlineLongPressTimerRef.current !== null) {
        window.clearTimeout(deadlineLongPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!taskActionTarget) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !completingId) {
        setTaskActionTarget(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [taskActionTarget, completingId]);

  useEffect(() => {
    if (!movingTaskTarget && !movingDeadlineTarget) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!movingTaskId) {
        setMovingTaskTarget(null);
      }
      if (!movingDeadlineId) {
        setMovingDeadlineTarget(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [movingTaskId, movingTaskTarget, movingDeadlineId, movingDeadlineTarget]);

  useEffect(() => {
    if (!movingTaskTarget) return;
    setMovingTaskWorkingDays(movingTaskTarget.work_days ?? []);
  }, [movingTaskTarget]);

  useEffect(() => {
    if (!movingDeadlineTarget) return;
    setMovingDeadlineDate(movingDeadlineTarget.due_date ?? "");
  }, [movingDeadlineTarget]);

  useEffect(() => {
    if (sessionState !== "authed") return;

    return onTasksUpdated(() => {
      loadPlanningData().catch(() => {});
    });
  }, [loadPlanningData, sessionState]);

  function getTasksFor(target: DropTarget) {
    const date = target.date;
    return tasks
      .filter((task) => task.status === "OPEN" && task.work_days?.includes(date))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }

  async function moveTask(taskId: string, targetDate: string | null) {
    setPlanningErr(null);
    const currentTask = tasks.find((task) => task.id === taskId);
    const nextDays =
      targetDate === null
        ? null
        : Array.from(new Set([...(currentTask?.work_days ?? []), targetDate])).sort();

    const payload: Pick<Task, "status" | "work_days"> =
      targetDate === null
        ? { status: "INBOX", work_days: null }
        : { status: "OPEN", work_days: nextDays };

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
    }
  }

  async function moveDeadline(taskId: string, targetDate: string) {
    setPlanningErr(null);
    const payload: Pick<Task, "due_date"> = { due_date: targetDate };

    setDeadlines((prev) => {
      const hasItem = prev.some((task) => task.id === taskId);
      if (hasItem) {
        return prev.map((task) =>
          task.id === taskId ? { ...task, due_date: targetDate } : task
        );
      }
      const source = tasks.find((task) => task.id === taskId);
      if (!source) return prev;
      return [...prev, { ...source, due_date: targetDate }];
    });

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: targetDate } : task
      )
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
    }
  }

  async function updateTaskWorkingDays(taskId: string, nextDays: string[]) {
    setPlanningErr(null);
    const normalizedDays = Array.from(new Set(nextDays)).sort();
    const payload: Pick<Task, "status" | "work_days"> = {
      status: normalizedDays.length > 0 ? "OPEN" : "INBOX",
      work_days: normalizedDays.length > 0 ? normalizedDays : null,
    };

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
      return;
    }

    await loadPlanningData().catch(() => {});
  }

  async function removeDayFromTask(taskId: string, day: string) {
    setPlanningErr(null);
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask?.work_days) return;

    const nextDays = currentTask.work_days.filter((value) => value !== day);
    const payload: Pick<Task, "status" | "work_days"> = {
      status: currentTask.status,
      work_days: nextDays.length > 0 ? nextDays : null,
    };

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
    }
  }

  async function completeTaskFromWeek(task: Task) {
    if (completingId) return;
    setPlanningErr(null);
    setCompletingId(task.id);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setCompletingId(null);

    if (error) {
      setPlanningErr(error.message);
      return;
    }

    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    setDeadlines((prev) => prev.filter((item) => item.id !== task.id));
    setTaskActionTarget(null);
    emitTasksUpdated();
    showTaskCompletedOverlay();
  }

  function goPrevDay() {
    setActiveDayIndex((prev) => {
      if (prev > 0) return prev - 1;
      setWeekStart((current) => addDays(current, -7));
      return 4;
    });
  }

  function goNextDay() {
    setActiveDayIndex((prev) => {
      if (prev < 4) return prev + 1;
      setWeekStart((current) => addDays(current, 7));
      return 0;
    });
  }

  function goToToday() {
    const now = new Date();
    const weekday = now.getDay();
    const nextIndex =
      weekday === 0 || weekday === 6
        ? 4
        : Math.min(4, Math.max(0, weekday - 1));
    setWeekStart(startOfWeek(now));
    setActiveDayIndex(nextIndex);
  }

  function handleDayTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  }

  function handleDayTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    const touch = event.changedTouches[0];
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    if (!touch || startX === null || startY === null) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 46 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (deltaX < 0) {
      goNextDay();
      return;
    }
    goPrevDay();
  }

  function cancelTaskLongPress() {
    if (taskLongPressTimerRef.current !== null) {
      window.clearTimeout(taskLongPressTimerRef.current);
      taskLongPressTimerRef.current = null;
    }
  }

  function cancelDeadlineLongPress() {
    if (deadlineLongPressTimerRef.current !== null) {
      window.clearTimeout(deadlineLongPressTimerRef.current);
      deadlineLongPressTimerRef.current = null;
    }
  }

  function startTaskLongPress(task: Task) {
    cancelTaskLongPress();
    taskLongPressTimerRef.current = window.setTimeout(() => {
      consumeTaskClickRef.current = task.id;
      setMovingTaskTarget(task);
      taskLongPressTimerRef.current = null;
    }, 420);
  }

  function startDeadlineLongPress(task: Task) {
    cancelDeadlineLongPress();
    deadlineLongPressTimerRef.current = window.setTimeout(() => {
      consumeDeadlineClickRef.current = task.id;
      setMovingDeadlineTarget(task);
      deadlineLongPressTimerRef.current = null;
    }, 420);
  }

  function handleTaskTap(task: Task) {
    if (consumeTaskClickRef.current === task.id) {
      consumeTaskClickRef.current = null;
      return;
    }
    setTaskActionTarget(task);
  }

  function handleDeadlineTap(task: Task) {
    if (consumeDeadlineClickRef.current === task.id) {
      consumeDeadlineClickRef.current = null;
      return;
    }
    setTaskActionTarget(task);
  }

  async function applyMovingTaskDates(nextDates: string[]) {
    if (!movingTaskTarget || movingTaskId) return;
    setMovingTaskId(movingTaskTarget.id);
    await updateTaskWorkingDays(movingTaskTarget.id, nextDates);
    setMovingTaskId(null);
    setMovingTaskTarget(null);
    setMovingTaskWorkingDays([]);
  }

  async function applyMovingDeadlineDate() {
    if (!movingDeadlineTarget || !movingDeadlineDate || movingDeadlineId) return;
    setMovingDeadlineId(movingDeadlineTarget.id);
    await moveDeadline(movingDeadlineTarget.id, movingDeadlineDate);
    setMovingDeadlineId(null);
    setMovingDeadlineTarget(null);
    setMovingDeadlineDate("");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetDate: string | null) {
    event.preventDefault();
    const deadlineData = event.dataTransfer.getData(DRAG_TYPE_DEADLINE);
    const taskData = event.dataTransfer.getData(DRAG_TYPE_TASK);
    const plainData = event.dataTransfer.getData("text/plain");
    const inferDeadlineFromUrl =
      !taskData &&
      !draggingId &&
      !draggingIdRef.current &&
      /^https?:\/\/.+\/task\/[0-9a-f-]{36}(?:$|[/?#])/i.test(plainData);

    const deadlineId =
      parseDraggedTaskId(deadlineData) ??
      parseDraggedTaskId(
        plainData.startsWith(DEADLINE_PREFIX) ? plainData : null
      ) ??
      (inferDeadlineFromUrl ? parseDraggedTaskId(plainData) : null);

    if (deadlineId && targetDate) {
      dropHandledRef.current = true;
      void moveDeadline(deadlineId, targetDate);
      setDraggingId(null);
      draggingIdRef.current = null;
      setDraggingFrom(null);
      draggingFromRef.current = null;
      setHoverTarget(null);
      return;
    }

    const taskId = parseDraggedTaskId(
      draggingId ?? draggingIdRef.current ?? taskData ?? plainData
    );
    if (!taskId) return;

    dropHandledRef.current = true;
    void moveTask(taskId, targetDate);
    setDraggingId(null);
    draggingIdRef.current = null;
    setDraggingFrom(null);
    draggingFromRef.current = null;
    setHoverTarget(null);
  }

  const isAuthed = sessionState === "authed";
  const shouldOnboard =
    isAuthed && profileChecked && !profileLoading && !profile?.full_name;
  const greetingName = profile?.full_name ?? userName;
  const greeting = greetingName ? `Ciao ${greetingName}!` : "Ciao!";
  const mobileDayTasks = activeDay ? getTasksFor(activeDay) : [];
  const mobileDayDeadlines = activeDay ? deadlinesByDay.get(activeDay.date) ?? [] : [];
  const isActiveDayToday = activeDay?.date === today;
  const isActiveDayPast = activeDay ? activeDay.date < today : false;
  const homeContextHintOptions = useMemo(() => {
    if (loadingPlanning) return [];
    const todayTasks = tasks.filter((task) => task.work_days?.includes(today)).length;
    const criticalTodayTasks = tasks.filter(
      (task) =>
        task.work_days?.includes(today) &&
        (task.priority === "P0" || task.priority === "P1")
    ).length;
    const weekDeadlines = deadlines.length;
    const unassignedTodayTasks = tasks.filter(
      (task) => task.work_days?.includes(today) && !task.project?.name
    ).length;
    return getHomeContextHints({
      todayTasks,
      criticalTodayTasks,
      weekDeadlines,
      unassignedTodayTasks,
    });
  }, [deadlines, loadingPlanning, tasks, today]);

  useEffect(() => {
    if (loadingPlanning) {
      setHomeContextHint("Sto aggiornando le informazioni utili per oggi...");
      return;
    }

    if (homeContextHintOptions.length === 0) {
      setHomeContextHint("Settimana leggera: nessun task pianificato per oggi");
      return;
    }

    setHomeContextHint((previous) => {
      if (homeContextHintOptions.length === 1) return homeContextHintOptions[0];
      const pool = previous
        ? homeContextHintOptions.filter((hint) => hint !== previous)
        : homeContextHintOptions;
      const source = pool.length > 0 ? pool : homeContextHintOptions;
      const randomIndex = Math.floor(Math.random() * source.length);
      return source[randomIndex];
    });
  }, [homeContextHintOptions, loadingPlanning]);

  useEffect(() => {
    if (!shouldOnboard) return;
    router.replace("/welcome");
  }, [router, shouldOnboard]);

  if (shouldOnboard) {
    return null;
  }

  if (isAuthed && !profileChecked) {
    return (
      <>
        <Nav />
        <main className="min-h-screen px-6 py-10 app-page">
          <div className="app-shell home-shell p-6 sm:p-8">
            <p className="meta-line">Caricamento profilo...</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-2 sm:px-3 lg:px-4 py-6 app-page">
        <div className="app-shell home-shell p-2 sm:p-3">
          {isAuthed ? (
            <>
              <div className="text-center mb-5">
                <h1 className="page-title">{greeting}</h1>
                <p className="home-greeting-placeholder">
                  {homeContextHint}
                </p>
              </div>

              {isMobile ? (
                <div className="mobile-home-wrap">
                  <div className="mobile-home-actions">
                    <button
                      type="button"
                      className="mobile-home-today-btn"
                      onClick={goToToday}
                    >
                      Oggi
                    </button>
                  </div>
                  <section className="p-0">
                    {planningErr ? (
                      <p className="mt-3 text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                        {planningErr}
                      </p>
                    ) : null}

                    {loadingPlanning || !activeDay ? (
                      <div className="mobile-day-shell">
                        <div className="glass-panel week-column mobile-day-card">
                          <div className="week-column-header">
                            <p className="week-column-label">Giorno</p>
                            <span className="week-column-date">Carico...</span>
                          </div>
                          <SkeletonList rows={4} />
                        </div>
                      </div>
                    ) : (
                      <div
                        className="mobile-day-shell"
                        onTouchStart={handleDayTouchStart}
                        onTouchEnd={handleDayTouchEnd}
                      >
                        <div
                          className={
                            "glass-panel week-column mobile-day-card " +
                            (isActiveDayToday ? "week-column-today " : "") +
                            (isActiveDayPast ? "week-column-past " : "")
                          }
                        >
                          <div className="week-column-header">
                            <p className="week-column-label">{activeDay.label}</p>
                            <span className="week-column-date">
                              {isActiveDayToday
                                ? "Oggi"
                                : formatDisplayDate(activeDay.date)}
                            </span>
                          </div>

                          {mobileDayDeadlines.length > 0 ? (
                            <div className="deadline-strip">
                              {mobileDayDeadlines.map((task) => (
                                <button
                                  key={task.id}
                                  type="button"
                                  className="deadline-chip deadline-chip-static"
                                  onPointerDown={(event) => {
                                    if (event.pointerType !== "touch") return;
                                    startDeadlineLongPress(task);
                                  }}
                                  onPointerUp={(event) => {
                                    if (event.pointerType !== "touch") return;
                                    cancelDeadlineLongPress();
                                  }}
                                  onPointerCancel={cancelDeadlineLongPress}
                                  onClick={() => handleDeadlineTap(task)}
                                >
                                  {task.title}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {mobileDayTasks.length > 0 ? (
                            <ul className="week-task-list mobile-week-task-list">
                              {mobileDayTasks.map((task) => {
                                const priorityMeta = getPriorityMeta(task.priority);
                                const typeMeta = getTypeMeta(task.type);

                                return (
                                  <ListRow
                                    key={task.id}
                                    className={`list-row-compact list-row-stack week-task mobile-week-task priority-card priority-card-${priorityMeta.tone}`}
                                  >
                                    <button
                                      type="button"
                                      className="text-sm week-task-title week-task-title-btn"
                                      onPointerDown={(event) => {
                                        if (event.pointerType !== "touch") return;
                                        startTaskLongPress(task);
                                      }}
                                      onPointerUp={(event) => {
                                        if (event.pointerType !== "touch") return;
                                        cancelTaskLongPress();
                                      }}
                                      onPointerCancel={cancelTaskLongPress}
                                      onClick={() => handleTaskTap(task)}
                                    >
                                      {task.title}
                                    </button>
                                    <div className="flex flex-wrap items-center week-task-meta">
                                      <span className="meta-line week-task-type">
                                        {typeMeta.emoji}
                                      </span>
                                      <span className="meta-line meta-project">
                                        · {task.project?.name ?? "NESSUN PROGETTO"}
                                      </span>
                                    </div>
                                  </ListRow>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="week-column-state">Nessun task pianificato.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div>
                  <section className="p-0">
                    {planningErr ? (
                      <p className="mt-3 text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                        {planningErr}
                      </p>
                    ) : null}

                    {loadingPlanning ? (
                      <div className="week-board-shell">
                        <button
                          type="button"
                          className="week-side-arrow"
                          aria-label="Settimana precedente"
                          disabled
                        >
                          <Icon name="arrow-left" size={22} />
                        </button>
                        <div className="week-board week-board-home">
                          {days.map((target) => (
                            <div
                              key={target.id}
                              className="glass-panel week-column week-column-fixed"
                            >
                              <div className="week-column-header">
                                <p className="week-column-label">{target.label}</p>
                                <span className="week-column-date">
                                  {formatDisplayDate(target.date)}
                                </span>
                              </div>
                              <SkeletonList rows={2} />
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="week-side-arrow"
                          aria-label="Settimana successiva"
                          disabled
                        >
                          <Icon name="arrow-right" size={22} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="week-board-shell">
                          <button
                            type="button"
                            className="week-side-arrow"
                            aria-label="Settimana precedente"
                            onClick={() => setWeekStart(addDays(weekStart, -7))}
                          >
                            <Icon name="arrow-left" size={22} />
                          </button>

                          <div className="week-board week-board-home">
                            {days.map((target) => {
                              const columnTasks = getTasksFor(target);
                              const deadlineTasks = deadlinesByDay.get(target.date) ?? [];
                              const isToday = target.date === today;
                              const isPast = target.date < today;

                              return (
                                <div
                                  key={target.id}
                                  className={
                                    "glass-panel week-column week-column-fixed " +
                                    (isToday ? "week-column-today " : "") +
                                    (isPast ? "week-column-past " : "") +
                                    (hoverTarget === target.id
                                      ? "week-column-hover"
                                      : "")
                                  }
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    setHoverTarget(target.id);
                                  }}
                                  onDragLeave={() => setHoverTarget(null)}
                                  onDrop={(event) => handleDrop(event, target.date)}
                                >
                                  <div className="week-column-header">
                                    <p className="week-column-label">{target.label}</p>
                                    <span className="week-column-date">
                                      {isToday ? "Oggi" : formatDisplayDate(target.date)}
                                    </span>
                                  </div>

                                  {deadlineTasks.length > 0 ? (
                                    <div className="deadline-strip">
                                      {deadlineTasks.map((task) => (
                                        <span
                                          key={task.id}
                                          className="deadline-chip cursor-grab active:cursor-grabbing"
                                          draggable
                                          onDragStart={(event) => {
                                            event.dataTransfer.effectAllowed = "move";
                                            event.dataTransfer.setData(
                                              DRAG_TYPE_DEADLINE,
                                              task.id
                                            );
                                            event.dataTransfer.setData(
                                              "text/plain",
                                              `${DEADLINE_PREFIX}${task.id}`
                                            );
                                          }}
                                          onDragEnd={() => {
                                            setHoverTarget(null);
                                          }}
                                        >
                                          {task.title}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}

                                  {columnTasks.length > 0 ? (
                                    <ul className="week-task-list">
                                      {columnTasks.map((task) => {
                                        const priorityMeta = getPriorityMeta(task.priority);
                                        const typeMeta = getTypeMeta(task.type);

                                        return (
                                          <ListRow
                                            key={task.id}
                                            className={`list-row-compact list-row-stack week-task cursor-grab active:cursor-grabbing priority-card priority-card-${priorityMeta.tone}`}
                                            draggable
                                            onDragStart={(event) => {
                                              event.dataTransfer.effectAllowed = "move";
                                              event.dataTransfer.setData(
                                                DRAG_TYPE_TASK,
                                                task.id
                                              );
                                              event.dataTransfer.setData(
                                                "text/plain",
                                                task.id
                                              );
                                              dropHandledRef.current = false;
                                              setDraggingId(task.id);
                                              draggingIdRef.current = task.id;
                                              setDraggingFrom(target.date);
                                              draggingFromRef.current = target.date;
                                            }}
                                            onDragEnd={(event) => {
                                              const taskId =
                                                draggingIdRef.current ??
                                                parseDraggedTaskId(
                                                  event.dataTransfer.getData("text/plain")
                                                );
                                              const fromDate =
                                                draggingFromRef.current ?? draggingFrom;
                                              if (
                                                !dropHandledRef.current &&
                                                fromDate &&
                                                taskId
                                              ) {
                                                removeDayFromTask(taskId, fromDate);
                                              }
                                              dropHandledRef.current = false;
                                              setDraggingId(null);
                                              draggingIdRef.current = null;
                                              setDraggingFrom(null);
                                              draggingFromRef.current = null;
                                            }}
                                          >
                                            <button
                                              type="button"
                                              className="text-sm week-task-title week-task-title-btn"
                                              onPointerDown={(event) => event.stopPropagation()}
                                              onClick={() => setTaskActionTarget(task)}
                                            >
                                              {task.title}
                                            </button>
                                            <div className="flex flex-wrap items-center week-task-meta">
                                              <span className="meta-line week-task-type">
                                                {typeMeta.emoji}
                                              </span>
                                              <span className="meta-line meta-project">
                                                · {task.project?.name ?? "NESSUN PROGETTO"}
                                              </span>
                                            </div>
                                          </ListRow>
                                        );
                                      })}
                                    </ul>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            className="week-side-arrow"
                            aria-label="Settimana successiva"
                            onClick={() => setWeekStart(addDays(weekStart, 7))}
                          >
                            <Icon name="arrow-right" size={22} />
                          </button>
                        </div>

                      </>
                    )}
                  </section>
                </div>
              )}
            </>
          ) : (
            <section className="px-2 py-8">
              <EmptyState
                title="Accedi per iniziare"
                description="Il tuo spazio di lavoro e le tue liste ti aspettano."
                action={
                  <Link href="/login" className="btn-primary px-4 py-2 text-sm">
                    Accedi con magic link
                  </Link>
                }
              />
            </section>
          )}
        </div>
      </main>
      <TaskEditModal
        open={Boolean(editingTask)}
        task={editingTask}
        projects={projects}
        onClose={() => setEditingTask(null)}
        onSaved={() => {
          setEditingTask(null);
          void loadPlanningData();
        }}
      />
      {taskCompletedOverlayVisible ? (
        <div className="task-created-overlay" role="status" aria-live="polite">
          <p className="task-created-overlay-text">Task completato</p>
        </div>
      ) : null}
      {movingTaskTarget ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sposta task"
          onClick={() => {
            if (!movingTaskId) {
              setMovingTaskTarget(null);
            }
          }}
        >
          <div
            className="app-confirm-dialog project-type-picker week-task-action-picker mobile-move-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="project-type-title">Sposta task</p>
            <p className="project-type-name">{movingTaskTarget.title}</p>
            <DatePicker
              mode="multiple"
              value={movingTaskWorkingDays}
              onChange={setMovingTaskWorkingDays}
              onConfirm={(next) => {
                void applyMovingTaskDates(next);
              }}
              confirmLabel="✓"
              placeholder="Quando ci lavori?"
              ariaLabel="Nuovi giorni di lavoro"
              wrapperClassName="mobile-move-date"
            />
            <button
              type="button"
              className="project-type-cancel"
              onClick={() => setMovingTaskTarget(null)}
              disabled={Boolean(movingTaskId)}
            >
              {movingTaskId ? "Sposto..." : "Annulla"}
            </button>
          </div>
        </div>
      ) : null}
      {movingDeadlineTarget ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sposta scadenza"
          onClick={() => {
            if (!movingDeadlineId) {
              setMovingDeadlineTarget(null);
            }
          }}
        >
          <div
            className="app-confirm-dialog project-type-picker week-task-action-picker mobile-move-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="project-type-title">Sposta scadenza</p>
            <p className="project-type-name">{movingDeadlineTarget.title}</p>
            <DatePicker
              value={movingDeadlineDate}
              onChange={setMovingDeadlineDate}
              placeholder="Nuova scadenza"
              ariaLabel="Nuova scadenza"
              wrapperClassName="mobile-move-date"
            />
            <div className="app-confirm-actions mobile-move-actions">
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={() => setMovingDeadlineTarget(null)}
                disabled={Boolean(movingDeadlineId)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="logout-confirm-btn logout-confirm-btn-success"
                onClick={() => {
                  void applyMovingDeadlineDate();
                }}
                disabled={!movingDeadlineDate || Boolean(movingDeadlineId)}
              >
                {movingDeadlineId ? "Sposto..." : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {taskActionTarget ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Azione task"
          onClick={() => setTaskActionTarget(null)}
        >
          <div
            className="app-confirm-dialog project-type-picker week-task-action-picker"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="project-type-title">Cosa vuoi fare?</p>
            <div className="wizard-type-switch week-task-action-switch">
              <button
                type="button"
                className="wizard-type-btn"
                onClick={() => {
                  const target = taskActionTarget;
                  setTaskActionTarget(null);
                  if (target) {
                    setEditingTask(target);
                  }
                }}
                disabled={Boolean(completingId)}
              >
                Modifica
              </button>
              <button
                type="button"
                className="wizard-type-btn week-task-action-complete"
                onClick={() => {
                  void completeTaskFromWeek(taskActionTarget);
                }}
                disabled={completingId === taskActionTarget.id}
              >
                {completingId === taskActionTarget.id ? "Completo..." : "Completa"}
              </button>
            </div>
            <button
              type="button"
              className="project-type-cancel"
              onClick={() => setTaskActionTarget(null)}
              disabled={Boolean(completingId)}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
