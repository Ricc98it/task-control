"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DatePicker from "@/components/DatePicker";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import Nav from "@/components/Nav";
import SkeletonList from "@/components/SkeletonList";
import TaskEditModal from "@/components/TaskEditModal";
import { useIsMobile } from "@/lib/useIsMobile";
import { addDays, formatDisplayDate, formatISODate, getPriorityMeta, getTypeMeta, todayISO, type Task } from "@/lib/tasks";
import { useSession } from "@/hooks/useSession";
import { useProfile } from "@/hooks/useProfile";
import { usePlanningData } from "@/hooks/usePlanningData";
import { useWeekNavigation } from "@/hooks/useWeekNavigation";
import { useCompletionOverlay } from "@/hooks/useCompletionOverlay";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useDragDrop, parseDraggedTaskId, DRAG_TYPE_TASK, DRAG_TYPE_DEADLINE, DEADLINE_PREFIX } from "@/hooks/useDragDrop";
import { useSwipeAndLongPress } from "@/hooks/useSwipeAndLongPress";
import { useContextHint } from "@/hooks/useContextHint";

function priorityRank(priority: Task["priority"]): number {
  if (priority === "P0") return 0;
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  return 4;
}

export default function HomePage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  // --- Session & profile ---
  const { sessionState, sessionUser, userName } = useSession();
  const { profile, profileLoading, profileChecked } = useProfile(sessionState, sessionUser);

  // --- Week navigation ---
  const {
    weekStart,
    setWeekStart,
    days,
    previousDay,
    nextDay,
    activeDay,
    goPrevDay,
    goNextDay,
    goToToday,
  } = useWeekNavigation();

  // --- Data fetching ---
  const {
    tasks,
    deadlines,
    projects,
    loadingPlanning,
    planningErr,
    setPlanningErr,
    loadPlanningData,
    setTasks,
    setDeadlines,
    latestDoneTaskCreatedAt,
  } = usePlanningData(sessionState, weekStart);

  // --- Completion overlay ---
  const {
    taskCompletedOverlayVisible,
    showTaskCompletedOverlay,
    lastTaskCompletedSignal,
  } = useCompletionOverlay();

  // --- Modal state (UI-only, stays in page) ---
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskActionTarget, setTaskActionTarget] = useState<Task | null>(null);
  const [movingTaskTarget, setMovingTaskTarget] = useState<Task | null>(null);
  const [movingTaskWorkingDays, setMovingTaskWorkingDays] = useState<string[]>([]);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [movingDeadlineTarget, setMovingDeadlineTarget] = useState<Task | null>(null);
  const [movingDeadlineDate, setMovingDeadlineDate] = useState("");
  const [movingDeadlineId, setMovingDeadlineId] = useState<string | null>(null);

  // --- Task actions ---
  const {
    completingId,
    moveTask,
    moveDeadline,
    updateTaskWorkingDays,
    removeDayFromTask,
    completeTaskFromWeek,
  } = useTaskActions({
    tasks,
    setTasks,
    setDeadlines,
    setPlanningErr,
    loadPlanningData,
    showTaskCompletedOverlay,
    onCompleted: () => setTaskActionTarget(null),
  });

  // --- Drag & drop ---
  const {
    setDraggingId,
    draggingFrom,
    setDraggingFrom,
    hoverTarget,
    setHoverTarget,
    dropHandledRef,
    draggingIdRef,
    draggingFromRef,
    handleDrop,
  } = useDragDrop({ moveTask, moveDeadline });

  function openMovingTaskModal(task: Task) {
    setMovingTaskTarget(task);
    setMovingTaskWorkingDays(task.work_days ?? []);
  }

  function openMovingDeadlineModal(task: Task) {
    setMovingDeadlineTarget(task);
    setMovingDeadlineDate(task.due_date ?? "");
  }

  function closeMovingTaskModal() {
    if (movingTaskId) return;
    setMovingTaskTarget(null);
    setMovingTaskWorkingDays([]);
  }

  function closeMovingDeadlineModal() {
    if (movingDeadlineId) return;
    setMovingDeadlineTarget(null);
    setMovingDeadlineDate("");
  }

  // --- Swipe & long press ---
  const {
    handleDayTouchStart,
    handleDayTouchEnd,
    cancelTaskLongPress,
    cancelDeadlineLongPress,
    startTaskLongPress,
    startDeadlineLongPress,
    handleTaskTap,
    handleDeadlineTap,
  } = useSwipeAndLongPress({
    isMobile,
    goPrevDay,
    goNextDay,
    setMovingTaskTarget: openMovingTaskModal,
    setMovingDeadlineTarget: openMovingDeadlineModal,
    setTaskActionTarget,
  });

  // --- Derived values ---
  const today = useMemo(() => todayISO(), []);
  const yesterday = useMemo(() => formatISODate(addDays(new Date(), -1)), []);

  // --- Context hint ---
  const { homeContextHint } = useContextHint({
    tasks,
    deadlines,
    loadingPlanning,
    lastTaskCompletedSignal,
    latestDoneTaskCreatedAt,
    today,
    yesterday,
  });

  // --- Derived display values ---
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

  const isAuthed = sessionState === "authed";
  const shouldOnboard = isAuthed && profileChecked && !profileLoading && !profile?.full_name;
  const greetingName = profile?.full_name ?? userName;
  const greeting = greetingName ? `Ciao ${greetingName}!` : "Ciao!";
  const mobileDayTasks = activeDay ? getTasksFor(activeDay) : [];
  const mobileDayDeadlines = activeDay ? deadlinesByDay.get(activeDay.date) ?? [] : [];
  const isActiveDayToday = activeDay?.date === today;
  const isActiveDayPast = activeDay ? activeDay.date < today : false;
  const isOnToday = isActiveDayToday;

  // --- Helpers ---
  function getTasksFor(target: { date: string }) {
    return tasks
      .filter((task) => task.status === "OPEN" && task.work_days?.includes(target.date))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
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

  // --- Effects ---
  useEffect(() => {
    if (!taskActionTarget) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !completingId) {
        setTaskActionTarget(null);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [taskActionTarget, completingId]);

  useEffect(() => {
    if (!movingTaskTarget && !movingDeadlineTarget) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!movingTaskId) {
        setMovingTaskTarget(null);
        setMovingTaskWorkingDays([]);
      }
      if (!movingDeadlineId) {
        setMovingDeadlineTarget(null);
        setMovingDeadlineDate("");
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [movingTaskId, movingTaskTarget, movingDeadlineId, movingDeadlineTarget]);

  useEffect(() => {
    if (!shouldOnboard) return;
    router.replace("/welcome");
  }, [router, shouldOnboard]);

  // --- Early returns ---
  if (shouldOnboard) return null;

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
      <main
        className={
          isMobile
            ? "min-h-screen px-2 py-2 app-page app-page-mobile-home"
            : "min-h-screen px-2 sm:px-3 lg:px-4 py-6 app-page"
        }
      >
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
                      disabled={isOnToday}
                    >
                      Task di oggi
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
                          className="glass-panel week-column mobile-day-peek"
                          aria-hidden="true"
                        >
                          <div className="week-column-header">
                            <p className="week-column-label">{previousDay.label}</p>
                            <span className="week-column-date">
                              {formatDisplayDate(previousDay.date)}
                            </span>
                          </div>
                        </div>
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
                                  className={`deadline-chip deadline-chip-static ${
                                    task.status === "DONE" ? "deadline-chip-done" : ""
                                  }`.trim()}
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
                          ) : (
                            <p className="week-deadline-empty">Nessuna scadenza</p>
                          )}

                          {mobileDayTasks.length > 0 ? (
                            <ul className="week-task-list mobile-week-task-list">
                              {mobileDayTasks.map((task) => {
                                const priorityMeta = getPriorityMeta(task.priority);
                                const typeMeta = getTypeMeta(task.type);

                                return (
                                  <ListRow
                                    key={task.id}
                                    className={`list-row-compact list-row-stack week-task mobile-week-task priority-card priority-card-${priorityMeta.tone}`}
                                    onPointerDown={(event) => {
                                      if (event.pointerType !== "touch") return;
                                      startTaskLongPress(task);
                                    }}
                                    onPointerUp={(event) => {
                                      if (event.pointerType !== "touch") return;
                                      cancelTaskLongPress();
                                    }}
                                    onPointerCancel={cancelTaskLongPress}
                                    onPointerLeave={cancelTaskLongPress}
                                    onClick={() => handleTaskTap(task)}
                                  >
                                    <p className="text-sm week-task-title week-task-title-btn">
                                      {task.title}
                                    </p>
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
                        <div
                          className="glass-panel week-column mobile-day-peek"
                          aria-hidden="true"
                        >
                          <div className="week-column-header">
                            <p className="week-column-label">{nextDay.label}</p>
                            <span className="week-column-date">
                              {formatDisplayDate(nextDay.date)}
                            </span>
                          </div>
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
                                          className={`deadline-chip ${
                                            task.status === "DONE"
                                              ? "deadline-chip-done"
                                              : "cursor-grab active:cursor-grabbing"
                                          }`.trim()}
                                          draggable={task.status !== "DONE"}
                                          onDragStart={(event) => {
                                            if (task.status === "DONE") return;
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
                                  ) : (
                                    <p className="week-deadline-empty">Nessuna scadenza</p>
                                  )}

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
                    Accedi con codice email
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
            closeMovingTaskModal();
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
              wrapperClassName="mobile-move-date wizard-control-date"
              inputClassName="wizard-control-input"
            />
            <button
              type="button"
              className="project-type-cancel"
              onClick={closeMovingTaskModal}
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
            closeMovingDeadlineModal();
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
              wrapperClassName="mobile-move-date wizard-control-date"
              inputClassName="wizard-control-input"
            />
            <div className="app-confirm-actions mobile-move-actions">
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={closeMovingDeadlineModal}
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
            {taskActionTarget.notes?.trim() ? (
              <div className="week-task-action-notes-block">
                <p className="week-task-action-notes-label">Note</p>
                <div className="week-task-action-notes">
                  <p className="week-task-action-notes-text">
                    {taskActionTarget.notes.trim()}
                  </p>
                </div>
              </div>
            ) : null}
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
