"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Nav from "@/components/Nav";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import Select from "@/components/Select";
import SkeletonList from "@/components/SkeletonList";
import TaskEditModal from "@/components/TaskEditModal";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { emitTasksUpdated } from "@/lib/taskEvents";
import { markTaskCompletedNow } from "@/lib/taskCompletion";
import { useIsMobile } from "@/lib/useIsMobile";
import { TYPE_BUTTON_LABELS, UI } from "@/lib/constants";
import {
  formatDisplayDate,
  formatWorkDaysSummary,
  getPriorityMeta,
  joinMeta,
  normalizeTasks,
  PRIORITY_OPTIONS,
  type Project,
  type Task,
  type TaskPriority,
  type TaskType,
} from "@/lib/tasks";

const PAGE_SIZE = 50;

const PLAN_FILTER_OPTIONS = [
  { value: "TODO", label: "Da fare" },
  { value: "DONE", label: "Completati" },
  { value: "ALL", label: "Tutti" },
] as const;

export default function AllTasksPage() {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [activeType, setActiveType] = useState<TaskType>("WORK");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | TaskPriority>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [planFilter, setPlanFilter] = useState<"TODO" | "DONE" | "ALL">("TODO");

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const listParentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Measure the list container's offset from the top of the page so the
  // window virtualizer positions items correctly.
  useLayoutEffect(() => {
    if (listParentRef.current) {
      setScrollMargin(listParentRef.current.offsetTop);
    }
  }, [loading]); // re-measure when loading state changes (toolbar above may shift layout)

  const rowVirtualizer = useWindowVirtualizer({
    count: tasks.length,
    estimateSize: () => 88,
    gap: 10, // matches .list-stack { gap: 10px }
    overscan: 5,
    scrollMargin,
  });

  useEffect(() => {
    if (!completeTarget) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCompleteTarget(null);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [completeTarget]);

  const visibleProjects = useMemo(
    () => projects.filter((project) => (project.type ?? "WORK") === activeType),
    [projects, activeType]
  );

  const priorityFilterOptions = useMemo(
    () => [{ value: "ALL", label: "Criticità" }, ...PRIORITY_OPTIONS],
    []
  );

  const projectFilterOptions = useMemo(
    () => [
      { value: "ALL", label: "Progetti" },
      ...visibleProjects.map((project) => ({
        value: project.id,
        label: project.name.toUpperCase(),
      })),
    ],
    [visibleProjects]
  );

  // Builds the filtered task query for a given page offset.
  // Extracted to avoid duplicating filter logic between loadData and loadMore.
  const buildTaskQuery = useCallback(
    (offset: number) => {
      let query = supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name,type)"
        )
        .eq("type", activeType)
        .order("priority", { ascending: true, nullsFirst: false })
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("title", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (planFilter === "TODO") {
        query = query.in("status", ["OPEN", "INBOX"]);
      } else if (planFilter === "DONE") {
        query = query.eq("status", "DONE");
      }
      if (priorityFilter !== "ALL") {
        query = query.eq("priority", priorityFilter);
      }
      if (projectFilter !== "ALL") {
        query = query.eq("project_id", projectFilter);
      }
      return query;
    },
    [activeType, planFilter, priorityFilter, projectFilter]
  );

  // Initial load (called on mount and filter changes): resets the list.
  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setHasMore(false);
    setNextOffset(0);

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

    const [{ data, error }, { data: projectsData, error: projectsError }] =
      await Promise.all([
        buildTaskQuery(0),
        supabase.from("projects").select("id,name,type").order("name"),
      ]);

    if (error || projectsError) {
      setErr(error?.message ?? projectsError?.message ?? "Errore caricamento.");
      setTasks([]);
      setProjects([]);
      setLoading(false);
      return;
    }

    const normalized = normalizeTasks(data ?? []);
    setTasks(normalized);
    setProjects((projectsData ?? []) as Project[]);
    setHasMore((data?.length ?? 0) === PAGE_SIZE);
    setNextOffset(PAGE_SIZE);
    setLoading(false);
  }, [buildTaskQuery]);

  // Loads the next page and appends results.
  // nextOffset tracks the correct fetch position independently from tasks.length
  // so that optimistic removals (e.g. completing a task) don't skew the offset.
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);

    const { data, error } = await buildTaskQuery(nextOffset);

    if (!error && data) {
      setTasks((prev) => [...prev, ...normalizeTasks(data)]);
      setHasMore(data.length === PAGE_SIZE);
      setNextOffset((prev) => prev + PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, loading, nextOffset, buildTaskQuery]);

  // Trigger initial load (and re-load on filter changes).
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadData]);

  // IntersectionObserver: load next page when sentinel enters the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  async function markDone(task: Task) {
    setErr(null);
    setMarkingId(task.id);

    const payload: Pick<Task, "status" | "work_days"> = {
      status: "DONE",
      work_days: null,
    };
    const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);

    setMarkingId(null);
    if (error) {
      setErr(error.message);
      return;
    }

    setTasks((prev) => {
      if (planFilter === "TODO") {
        return prev.filter((item) => item.id !== task.id);
      }
      return prev.map((item) =>
        item.id === task.id ? { ...item, status: "DONE", work_days: null } : item
      );
    });
    markTaskCompletedNow();
    emitTasksUpdated();
  }

  const handleSavedEdit = useCallback(() => {
    setEditingTask(null);
    void loadData();
  }, [loadData]);

  const typeSwitcher = (
    <div
      className="wizard-type-switch tasks-main-switch"
      role="tablist"
      aria-label="Tipo task"
    >
      <button
        type="button"
        className={`wizard-type-btn ${activeType === "WORK" ? "is-active" : ""}`}
        onClick={() => {
          setActiveType("WORK");
          setProjectFilter("ALL");
        }}
        role="tab"
        aria-selected={activeType === "WORK"}
      >
        {TYPE_BUTTON_LABELS.WORK}
      </button>
      <button
        type="button"
        className={`wizard-type-btn ${activeType === "PERSONAL" ? "is-active" : ""}`}
        onClick={() => {
          setActiveType("PERSONAL");
          setProjectFilter("ALL");
        }}
        role="tab"
        aria-selected={activeType === "PERSONAL"}
      >
        {TYPE_BUTTON_LABELS.PERSONAL}
      </button>
    </div>
  );

  return (
    <>
      <Nav />
      <main
        className={`min-h-screen px-6 py-6 app-page ${
          isMobile ? "app-page-mobile-switcher app-page-mobile-tasks" : ""
        }`.trim()}
      >
        <div
          className={`app-shell max-w-5xl mx-auto px-6 pb-8 pt-3 sm:px-8 sm:pb-10 sm:pt-4 ${
            isMobile ? "tasks-page-shell tasks-page-shell-mobile" : ""
          }`.trim()}
        >
          <div className={`tasks-toolbar ${isMobile ? "tasks-toolbar-mobile" : ""}`.trim()}>
            {!isMobile ? (
              <div className="tasks-main-switch-wrap">{typeSwitcher}</div>
            ) : null}

            <div
              className={`tasks-filter-grid ${
                isMobile ? "tasks-filter-grid-mobile" : ""
              }`.trim()}
            >
              <Select
                value={priorityFilter}
                onChange={(next) => setPriorityFilter(next as "ALL" | TaskPriority)}
                options={priorityFilterOptions}
                placeholder="Criticità"
                ariaLabel="Criticità"
              />
              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                options={projectFilterOptions}
                placeholder="Progetti"
                ariaLabel="Progetti"
              />
              <Select
                value={planFilter}
                onChange={(next) => setPlanFilter(next as "TODO" | "DONE" | "ALL")}
                options={PLAN_FILTER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                placeholder="Da fare"
                ariaLabel="Stato task"
              />
            </div>
          </div>

          {err ? (
            <p className="mt-4 text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
              {err}
            </p>
          ) : null}

          {loading ? (
            <SkeletonList rows={5} />
          ) : (
            <div
              className={`tasks-list-shell ${
                isMobile ? "tasks-list-shell-mobile" : ""
              }`.trim()}
            >
              {tasks.length === 0 ? (
                <div className="tasks-empty-state">
                  <p className="meta-line">Nessun task qui.</p>
                </div>
              ) : (
                <>
                  {/* Virtual list parent: the virtualizer measures offsetTop from here */}
                  <div ref={listParentRef}>
                    <ul
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        position: "relative",
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const task = tasks[virtualRow.index];
                        if (!task) return null;

                        const workSummary = formatWorkDaysSummary(task.work_days ?? []);
                        const workDaysCount = task.work_days?.length ?? 0;
                        const workDaysLabel =
                          workDaysCount === 1 ? "Giorno di lavoro" : "Giorni di lavoro";
                        const planMeta =
                          task.status === "DONE"
                            ? "Stato: Completato"
                            : task.status === "INBOX"
                            ? `${workDaysLabel}: Da pianificare`
                            : workSummary
                            ? `${workDaysLabel}: ${workSummary}`
                            : `${workDaysLabel}: Da pianificare`;
                        const meta = joinMeta([
                          planMeta,
                          task.due_date
                            ? `Scadenza: ${formatDisplayDate(task.due_date)}`
                            : null,
                        ]);
                        const priorityMeta = getPriorityMeta(task.priority);

                        return (
                          <li
                            key={virtualRow.key}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${
                                virtualRow.start - rowVirtualizer.options.scrollMargin
                              }px)`,
                            }}
                          >
                            <ListRow
                              className={`list-row-compact list-row-start task-row-slim ${
                                task.status === "DONE" ? "task-row-completed" : ""
                              } ${isMobile ? "task-row-mobile-actions" : ""}`.trim()}
                            >
                              <div className="flex items-center justify-between gap-3 w-full">
                                <div className="min-w-0 task-row-copy">
                                  <p
                                    className={`task-title-text task-priority-title-${priorityMeta.tone}`}
                                  >
                                    {task.title}
                                  </p>
                                  <p className="text-sm text-slate-100 font-medium mt-1 truncate">
                                    {task.project?.name ?? UI.NO_PROJECT}
                                  </p>
                                  <p className="meta-line mt-1">{meta}</p>
                                  {task.notes?.trim() ? (
                                    <p className="meta-line mt-1 task-note-line">
                                      {task.notes.trim()}
                                    </p>
                                  ) : null}
                                </div>

                                {isMobile ? (
                                  <div className="task-row-icon-actions stretched-guard">
                                    <button
                                      type="button"
                                      className="task-row-icon-btn task-row-icon-btn-edit"
                                      onClick={() => setEditingTask(task)}
                                      aria-label={`Modifica ${task.title}`}
                                      title="Modifica"
                                    >
                                      <Icon name="edit" size={15} />
                                    </button>
                                    {task.status !== "DONE" ? (
                                      <button
                                        type="button"
                                        className="task-row-icon-btn task-row-icon-btn-complete"
                                        disabled={markingId === task.id}
                                        onClick={() => setCompleteTarget(task)}
                                        aria-label={`Completa ${task.title}`}
                                        title="Completa"
                                      >
                                        <Icon name="check" size={15} />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="task-row-actions stretched-guard">
                                    <Button
                                      variant="tertiary"
                                      size="sm"
                                      onClick={() => setEditingTask(task)}
                                    >
                                      {UI.EDIT}
                                    </Button>
                                    {task.status !== "DONE" ? (
                                      <button
                                        type="button"
                                        className="task-complete-btn"
                                        disabled={markingId === task.id}
                                        onClick={() => setCompleteTarget(task)}
                                        aria-label={`Completa ${task.title}`}
                                        title="Completa"
                                      >
                                        {UI.COMPLETE}
                                      </button>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </ListRow>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Sentinel: triggers loadMore when it enters the viewport */}
                  <div ref={sentinelRef} aria-hidden="true" />

                  {loadingMore ? <SkeletonList rows={3} /> : null}
                </>
              )}
            </div>
          )}
        </div>
      </main>
      {isMobile && !editingTask ? (
        <div className="mobile-bottom-switcher-shell">
          <div className="mobile-bottom-switcher">{typeSwitcher}</div>
        </div>
      ) : null}

      <TaskEditModal
        open={Boolean(editingTask)}
        task={editingTask}
        projects={projects}
        onClose={() => setEditingTask(null)}
        onSaved={handleSavedEdit}
      />

      {completeTarget ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Conferma completamento task"
          onClick={() => setCompleteTarget(null)}
        >
          <div
            className="app-confirm-dialog logout-confirm-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="app-confirm-title logout-confirm-title">Task completato?</p>
            <p className="app-confirm-body logout-confirm-body">
              Confermi di completare questo task?
            </p>
            <div className="app-confirm-actions logout-confirm-actions">
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={() => setCompleteTarget(null)}
                disabled={markingId === completeTarget.id}
              >
                {UI.CANCEL}
              </button>
              <button
                type="button"
                className="logout-confirm-btn logout-confirm-btn-success"
                onClick={() => {
                  const target = completeTarget;
                  setCompleteTarget(null);
                  if (target) {
                    void markDone(target);
                  }
                }}
                disabled={markingId === completeTarget.id}
              >
                {markingId === completeTarget.id ? UI.COMPLETING : UI.COMPLETE}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
