"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import DatePicker from "@/components/DatePicker";
import Button from "@/components/Button";
import ListRow from "@/components/ListRow";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import Select from "@/components/Select";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { emitTasksUpdated } from "@/lib/taskEvents";
import {
  formatStatusLabel,
  formatDisplayDate,
  formatWorkDaysSummary,
  getPriorityMeta,
  getStatusMeta,
  joinMeta,
  normalizeTasks,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type Project,
  type Task,
  type TaskPriority,
  type TaskType,
  TYPE_OPTIONS,
} from "@/lib/tasks";

export default function AllTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "INBOX">(
    "ALL"
  );
  const [typeFilter, setTypeFilter] = useState<"ALL" | TaskType>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | TaskPriority>(
    "ALL"
  );
  const [projectFilter, setProjectFilter] = useState<string>("ALL");

  useEffect(() => {
    async function run() {
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
        console.error(error);
        setErr(error instanceof Error ? error.message : "Errore sessione.");
        setLoading(false);
        return;
      }

      let query = supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
        )
        .in("status", ["OPEN", "INBOX"])
        .order("status", { ascending: true })
        .order("work_days", { ascending: true, nullsFirst: false })
        .order("due_date", { ascending: true, nullsFirst: false });

      if (statusFilter !== "ALL") {
        query = query.eq("status", statusFilter);
      }
      if (typeFilter !== "ALL") {
        query = query.eq("type", typeFilter);
      }
      if (priorityFilter !== "ALL") {
        query = query.eq("priority", priorityFilter);
      }
      if (projectFilter !== "ALL") {
        query = query.eq("project_id", projectFilter);
      }

      const [{ data, error }, { data: projectsData }] = await Promise.all([
        query,
        supabase.from("projects").select("id,name").order("name"),
      ]);

      if (error) {
        setErr(error.message);
      } else {
        setTasks(normalizeTasks(data ?? []));
      }
      setProjects((projectsData ?? []) as Project[]);
      setLoading(false);
    }

    run();
  }, [statusFilter, typeFilter, priorityFilter, projectFilter]);

  const work = tasks.filter((t) => t.type === "WORK");
  const personal = tasks.filter((t) => t.type === "PERSONAL");
  const totalCount = useMemo(() => tasks.length, [tasks]);
  const statusFilterOptions = useMemo(
    () => [
      { value: "ALL", label: "📋 Tutti (attivi)" },
      ...STATUS_OPTIONS.filter((option) => option.value !== "DONE"),
    ],
    [STATUS_OPTIONS]
  );
  const typeFilterOptions = useMemo(
    () => [{ value: "ALL", label: "✨ Tutti" }, ...TYPE_OPTIONS],
    [TYPE_OPTIONS]
  );
  const priorityFilterOptions = useMemo(
    () => [{ value: "ALL", label: "🌈 Tutte" }, ...PRIORITY_OPTIONS],
    [PRIORITY_OPTIONS]
  );
  const projectFilterOptions = useMemo(
    () => [
      { value: "ALL", label: "🗂️ Tutti i progetti" },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [projects]
  );

  async function updateTaskFields(
    task: Task,
    updates: Partial<Pick<Task, "work_days" | "due_date" | "status">>
  ) {
    const payload = Object.entries(updates).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      },
      {}
    );
    if (Object.keys(payload).length === 0) return;

    setErr(null);
    setUpdatingId(task.id);
    const previous = task;
    const nextStatus = updates.status ?? task.status;
    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id ? { ...item, ...updates } : item
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", task.id);

    setUpdatingId(null);
    if (error) {
      setErr(error.message);
      setTasks((prev) =>
        prev.map((item) => (item.id === task.id ? previous : item))
      );
    } else if (statusFilter !== "ALL" && nextStatus !== statusFilter) {
      setTasks((prev) => prev.filter((item) => item.id !== task.id));
    }
  }

  function handleWorkDaysChange(task: Task, next: string[]) {
    const normalized =
      next.length > 0 ? Array.from(new Set(next)).sort() : null;
    const updates: Partial<Pick<Task, "work_days" | "status">> = {
      work_days: normalized,
    };
    if (task.status === "INBOX" && normalized) {
      updates.status = "OPEN";
    }
    updateTaskFields(task, updates);
  }

  function handleDueDateChange(task: Task, next: string) {
    const due = next ? next : null;
    updateTaskFields(task, { due_date: due });
  }

  async function markDone(task: Task) {
    setErr(null);
    setMarkingId(task.id);
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id);
    setMarkingId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    emitTasksUpdated();
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10 app-page">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Tutti i task"
            subtitle={loading ? "Caricamento..." : `${totalCount} task attivi`}
          />

          {err && (
            <p className="mt-4 text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
              {err}
            </p>
          )}

          <div className="mt-6 glass-panel p-4">
            <SectionHeader
              title="Filtri"
              subtitle="Mostra solo cio che conta"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Select
                  value={statusFilter}
                  onChange={(next) =>
                    setStatusFilter(next as "ALL" | "OPEN" | "INBOX")
                  }
                  options={statusFilterOptions}
                  placeholder="Stato"
                  ariaLabel="Stato"
                />
              </div>
              <div>
                <Select
                  value={typeFilter}
                  onChange={(next) => setTypeFilter(next as "ALL" | TaskType)}
                  options={typeFilterOptions}
                  placeholder="Tipo"
                  ariaLabel="Tipo"
                />
              </div>
              <div>
                <Select
                  value={priorityFilter}
                  onChange={(next) =>
                    setPriorityFilter(next as "ALL" | TaskPriority)
                  }
                  options={priorityFilterOptions}
                  placeholder="Priorita"
                  ariaLabel="Priorita"
                />
              </div>
              <div>
                <Select
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={projectFilterOptions}
                  placeholder="Progetto"
                  ariaLabel="Progetto"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <SkeletonList rows={4} />
          ) : (
            <div className="mt-6 space-y-10">
              <Section
                title="💼 Lavoro"
                items={work}
                markingId={markingId}
                onComplete={markDone}
                updatingId={updatingId}
                onWorkDaysChange={handleWorkDaysChange}
                onDueDateChange={handleDueDateChange}
              />
              <Section
                title="🏡 Personale"
                items={personal}
                markingId={markingId}
                onComplete={markDone}
                updatingId={updatingId}
                onWorkDaysChange={handleWorkDaysChange}
                onDueDateChange={handleDueDateChange}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  items,
  onComplete,
  markingId,
  updatingId,
  onWorkDaysChange,
  onDueDateChange,
}: {
  title: string;
  items: Task[];
  onComplete: (task: Task) => void;
  markingId: string | null;
  updatingId: string | null;
  onWorkDaysChange: (task: Task, next: string[]) => void;
  onDueDateChange: (task: Task, next: string) => void;
}) {
  return (
    <section>
      <SectionHeader
        title={title}
        subtitle={`${items.length} task`}
      />
      {items.length === 0 ? (
        <p className="meta-line mt-2">Nessun task qui.</p>
      ) : (
        <ul className="mt-3 list-stack">
          {items.map((t) => {
            const workSummary = formatWorkDaysSummary(t.work_days ?? []);
            const workLabel =
              t.status === "INBOX"
                ? "📥 Da pianificare"
                : workSummary
                ? `Giorni: ${workSummary}`
                : "🕒 Da pianificare";
            const meta = joinMeta([
              workLabel,
              t.due_date ? `Scadenza: ${formatDisplayDate(t.due_date)}` : null,
            ]);
            const priorityMeta = getPriorityMeta(t.priority);
            const statusTone = getStatusMeta(t.status).tone;
            const hasWorkDays = Boolean(t.work_days && t.work_days.length > 0);
            return (
              <ListRow
                key={t.id}
                className={`list-row-lg list-row-start priority-card-${priorityMeta.tone}`}
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div>
                    <Link
                      className="link-primary stretched-link"
                      href={`/task/${t.id}`}
                    >
                      {t.title}
                    </Link>
                    {t.project?.name ? (
                      <p className="text-sm text-slate-100 font-medium mt-1">
                        {t.project.name}
                      </p>
                    ) : null}
                    <p className="meta-line mt-1">{meta}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 max-w-md stretched-guard">
                      <DatePicker
                        mode="multiple"
                        value={t.work_days ?? []}
                        onChange={(next) => onWorkDaysChange(t, next)}
                        inputClassName="px-3 py-2"
                        placeholder="Giorni di lavoro"
                        ariaLabel="Giorni di lavoro"
                        disabled={updatingId === t.id}
                      />
                      <DatePicker
                        value={t.due_date ?? ""}
                        onChange={(next) => onDueDateChange(t, next)}
                        inputClassName="px-3 py-2"
                        placeholder="Scadenza"
                        ariaLabel="Scadenza"
                        disabled={updatingId === t.id}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`badge-pill status-pill status-${statusTone} px-2 py-1`}
                    >
                      {formatStatusLabel(t.status, hasWorkDays)}
                    </span>
                    <Button
                      variant="tertiary"
                      size="sm"
                      disabled={markingId === t.id}
                      onClick={() => onComplete(t)}
                      className="stretched-guard"
                      icon={<Icon name="check" size={16} />}
                    >
                      Completa
                    </Button>
                  </div>
                </div>
              </ListRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}
