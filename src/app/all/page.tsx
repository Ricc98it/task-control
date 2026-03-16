"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useIsMobile } from "@/lib/useIsMobile";
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

const PLAN_FILTER_OPTIONS = [
  { value: "ALL", label: "Pianifica" },
  { value: "OPEN", label: "Pianificati" },
  { value: "INBOX", label: "Da pianificare" },
] as const;

export default function AllTasksPage() {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [activeType, setActiveType] = useState<TaskType>("WORK");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | TaskPriority>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>("ALL");
  const [planFilter, setPlanFilter] = useState<"ALL" | "OPEN" | "INBOX">("ALL");

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);

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

    let taskQuery = supabase
      .from("tasks")
      .select(
        "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name,type)"
      )
      .in("status", ["OPEN", "INBOX"])
      .eq("type", activeType)
      .order("priority", { ascending: true, nullsFirst: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true });

    if (planFilter !== "ALL") {
      taskQuery = taskQuery.eq("status", planFilter);
    }
    if (priorityFilter !== "ALL") {
      taskQuery = taskQuery.eq("priority", priorityFilter);
    }
    if (projectFilter !== "ALL") {
      taskQuery = taskQuery.eq("project_id", projectFilter);
    }

    const [{ data, error }, { data: projectsData, error: projectsError }] =
      await Promise.all([
        taskQuery,
        supabase.from("projects").select("id,name,type").order("name"),
      ]);

    if (error || projectsError) {
      setErr(error?.message ?? projectsError?.message ?? "Errore caricamento.");
      setTasks([]);
      setProjects([]);
      setLoading(false);
      return;
    }

    setTasks(normalizeTasks(data ?? []));
    setProjects((projectsData ?? []) as Project[]);
    setLoading(false);
  }, [activeType, planFilter, priorityFilter, projectFilter]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadData]);

  async function markDone(task: Task) {
    setErr(null);
    setMarkingId(task.id);

    const { error } = await supabase.from("tasks").delete().eq("id", task.id);

    setMarkingId(null);
    if (error) {
      setErr(error.message);
      return;
    }

    setTasks((prev) => prev.filter((item) => item.id !== task.id));
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
        💼 Lavoro
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
        🏡 Personale
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
                onChange={(next) => setPlanFilter(next as "ALL" | "OPEN" | "INBOX")}
                options={PLAN_FILTER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                placeholder="Pianifica"
                ariaLabel="Pianifica"
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
                <ul className="list-stack">
                  {tasks.map((task) => {
                    const workSummary = formatWorkDaysSummary(task.work_days ?? []);
                    const workDaysCount = task.work_days?.length ?? 0;
                    const workDaysLabel =
                      workDaysCount === 1 ? "Giorno di lavoro" : "Giorni di lavoro";
                    const planMeta =
                      task.status === "INBOX"
                        ? `${workDaysLabel}: Da pianificare`
                        : workSummary
                        ? `${workDaysLabel}: ${workSummary}`
                        : `${workDaysLabel}: Da pianificare`;
                    const meta = joinMeta([
                      planMeta,
                      task.due_date ? `Scadenza: ${formatDisplayDate(task.due_date)}` : null,
                    ]);
                    const priorityMeta = getPriorityMeta(task.priority);

                    return (
                      <ListRow
                        key={task.id}
                        className={`list-row-compact list-row-start task-row-slim ${
                          isMobile ? "task-row-mobile-actions" : ""
                        }`.trim()}
                      >
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div className="min-w-0 task-row-copy">
                            <p
                              className={`task-title-text task-priority-title-${priorityMeta.tone}`}
                            >
                              {task.title}
                            </p>
                            <p className="text-sm text-slate-100 font-medium mt-1 truncate">
                              {task.project?.name ?? "NESSUN PROGETTO"}
                            </p>
                            <p className="meta-line mt-1">{meta}</p>
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
                            </div>
                          ) : (
                            <div className="task-row-actions stretched-guard">
                              <Button
                                variant="tertiary"
                                size="sm"
                                onClick={() => setEditingTask(task)}
                              >
                                Modifica
                              </Button>
                              <button
                                type="button"
                                className="task-complete-btn"
                                disabled={markingId === task.id}
                                onClick={() => setCompleteTarget(task)}
                                aria-label={`Completa ${task.title}`}
                                title="Completa"
                              >
                                Completa
                              </button>
                            </div>
                          )}
                        </div>
                      </ListRow>
                    );
                  })}
                </ul>
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
                Annulla
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
                {markingId === completeTarget.id ? "Completo..." : "Completa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
