"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Nav from "@/components/Nav";
import Link from "next/link";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SkeletonList from "@/components/SkeletonList";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import {
  addDays,
  formatDisplayDate,
  getTypeMeta,
  formatISODate,
  getPriorityMeta,
  normalizeTasks,
  startOfWeek,
  todayISO,
  type Task,
} from "@/lib/tasks";

type DropTarget = { id: string; label: string; date: string };

export default function WeekPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dropHandledRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const draggingFromRef = useRef<string | null>(null);
  const draggingDeadlineIdRef = useRef<string | null>(null);
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

  const targets = useMemo<DropTarget[]>(() => days, [days]);
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

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);
      const weekStartISO = formatISODate(weekStart);
      const weekEndISO = formatISODate(addDays(weekStart, 4));

      try {
        const session = await ensureSession();
        if (!session) {
          setErr("Accedi per continuare.");
          setLoading(false);
          return;
        }
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Errore sessione.");
        setLoading(false);
        return;
      }

      const [plannedRes, deadlineRes] = await Promise.all([
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
      ]);

      if (!active) return;

      if (plannedRes.error) {
        setErr(plannedRes.error?.message ?? null);
      }
      if (deadlineRes.error) {
        setErr((current) => current ?? deadlineRes.error?.message ?? null);
      }

      setTasks(normalizeTasks(plannedRes.data ?? []));
      setDeadlines(normalizeTasks(deadlineRes.data ?? []));
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [weekStart]);

  async function moveTask(taskId: string, targetDate: string | null) {
    setErr(null);
    const currentTask = tasks.find((task) => task.id === taskId);
    const nextDays =
      targetDate === null
        ? null
        : Array.from(
            new Set([...(currentTask?.work_days ?? []), targetDate])
          ).sort();
    const payload: Pick<Task, "status" | "work_days"> =
      targetDate === null
        ? { status: "INBOX", work_days: null }
        : { status: "OPEN", work_days: nextDays };

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, ...payload } : task
      )
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) setErr(error.message);
  }

  async function moveDeadline(taskId: string, targetDate: string) {
    setErr(null);
    const current = deadlines.find((task) => task.id === taskId);
    const currentDate = current?.due_date ? current.due_date.slice(0, 10) : null;
    if (currentDate === targetDate) return;

    const payload: Pick<Task, "due_date"> = { due_date: targetDate };

    setDeadlines((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: targetDate } : task
      )
    );
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: targetDate } : task
      )
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) setErr(error.message);
  }

  async function clearDeadline(taskId: string) {
    setErr(null);
    const current = deadlines.find((task) => task.id === taskId);
    if (!current?.due_date) return;
    const payload: Pick<Task, "due_date"> = { due_date: null };

    setDeadlines((prev) => prev.filter((task) => task.id !== taskId));
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: null } : task
      )
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setErr(error.message);
      setDeadlines((prev) => [current, ...prev]);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, due_date: current.due_date } : task
        )
      );
    }
  }

  async function removeDayFromTask(taskId: string, day: string) {
    setErr(null);
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask?.work_days) return;
    const nextDays = currentTask.work_days.filter((value) => value !== day);
    const payload: Pick<Task, "status" | "work_days"> = {
      status: currentTask.status,
      work_days: nextDays.length > 0 ? nextDays : null,
    };

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, ...payload } : task
      )
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) setErr(error.message);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetDate: string | null) {
    event.preventDefault();
    const deadlineData =
      event.dataTransfer.getData("application/x-deadline-task") || "";
    const fromData = event.dataTransfer.getData("text/plain");
    const deadlineId = deadlineData
      ? deadlineData
      : fromData.startsWith("deadline:")
      ? fromData.replace("deadline:", "")
      : "";
    if (deadlineId && targetDate) {
      dropHandledRef.current = true;
      moveDeadline(deadlineId, targetDate);
      setHoverTarget(null);
      return;
    }
    const taskId = draggingId ?? draggingIdRef.current ?? fromData;
    if (taskId.startsWith("deadline:")) return;
    if (!taskId) return;
    dropHandledRef.current = true;
    moveTask(taskId, targetDate);
    setDraggingId(null);
    draggingIdRef.current = null;
    setHoverTarget(null);
  }

  function getTasksFor(target: DropTarget) {
    const date = target.date;
    return tasks.filter(
      (task) => task.status === "OPEN" && task.work_days?.includes(date)
    );
  }

  const weekStartISO = formatISODate(weekStart);
  const weekEndISO = formatISODate(addDays(weekStart, 4));
  const weekLabel = `Dal ${formatDisplayDate(weekStartISO, {
    withYear: true,
  })} al ${formatDisplayDate(weekEndISO, { withYear: true })}`;

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10 app-page">
        <div className="app-shell week-shell max-w-6xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Settimana"
            subtitle={weekLabel}
            right={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  icon={<Icon name="arrow-left" size={16} />}
                >
                  Indietro
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                  icon={<Icon name="calendar" size={16} />}
                >
                  Questa settimana
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  icon={<Icon name="arrow-right" size={16} />}
                >
                  Avanti
                </Button>
              </>
            }
          />

          {err && (
            <p className="mt-4 text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
              {err}
            </p>
          )}

          <div className="mt-6 week-board">
            {targets.map((target) => {
              const columnTasks = getTasksFor(target);
              const deadlineTasks = deadlinesByDay.get(target.date) ?? [];
              const isToday = target.date === today;
              return (
                <div
                  key={target.id}
                  className={
                    "glass-panel week-column " +
                    (isToday ? "week-column-today " : "") +
                    (hoverTarget === target.id ? "week-column-hover" : "")
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverTarget(target.id);
                  }}
                  onDragLeave={() => setHoverTarget(null)}
                  onDrop={(e) => handleDrop(e, target.date)}
                >
                  <div className="week-column-header">
                    <p className="week-column-label">{target.label}</p>
                    <span className="week-column-date">
                      {isToday ? "Oggi" : formatDisplayDate(target.date)}
                    </span>
                  </div>

                  {deadlineTasks.length > 0 && (
                    <div className="deadline-strip">
                      {deadlineTasks.map((task) => (
                        <Link
                          key={task.id}
                          href={`/task/${task.id}`}
                          className="deadline-chip"
                          draggable
                          onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/x-deadline-task",
                            task.id
                          );
                          event.dataTransfer.setData(
                            "text/plain",
                            `deadline:${task.id}`
                          );
                          event.dataTransfer.effectAllowed = "move";
                          dropHandledRef.current = false;
                          draggingDeadlineIdRef.current = task.id;
                        }}
                        onDragEnd={(event) => {
                          const raw = event.dataTransfer.getData("text/plain");
                          const fallbackId = raw.startsWith("deadline:")
                            ? raw.replace("deadline:", "")
                            : raw;
                          const taskId =
                            draggingDeadlineIdRef.current ??
                            event.dataTransfer.getData("application/x-deadline-task") ??
                            fallbackId;
                          if (!dropHandledRef.current && taskId) {
                            clearDeadline(taskId);
                          }
                          dropHandledRef.current = false;
                          draggingDeadlineIdRef.current = null;
                        }}
                      >
                        {task.title}
                      </Link>
                    ))}
                    </div>
                  )}

                  {loading ? (
                    <SkeletonList rows={2} />
                  ) : columnTasks.length === 0 ? (
                    <p className="week-column-state">Nessun task</p>
                  ) : (
                    <ul className="week-task-list">
                      {columnTasks.map((task) => {
                        const priorityMeta = getPriorityMeta(task.priority);
                        const typeMeta = getTypeMeta(task.type);
                        return (
                          <ListRow
                            key={task.id}
                            className={`list-row-stack week-task cursor-grab active:cursor-grabbing priority-card priority-card-${priorityMeta.tone}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", task.id);
                              dropHandledRef.current = false;
                              setDraggingId(task.id);
                          draggingIdRef.current = task.id;
                          setDraggingFrom(target.date);
                          draggingFromRef.current = target.date;
                        }}
                        onDragEnd={(event) => {
                          const taskId =
                            draggingIdRef.current ??
                            event.dataTransfer.getData("text/plain");
                          const fromDate = draggingFromRef.current ?? draggingFrom;
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
                            <Link
                              href={`/task/${task.id}`}
                              className="link-primary text-sm week-task-title"
                            >
                              {task.title}
                            </Link>
                            <div className="flex flex-wrap items-center week-task-meta">
                              <span className="meta-line week-task-type">
                                {typeMeta.emoji}
                              </span>
                              {task.project?.name ? (
                                <span className="meta-line meta-project">
                                  · {task.project.name}
                                </span>
                              ) : null}
                            </div>
                          </ListRow>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
