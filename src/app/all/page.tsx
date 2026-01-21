"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import Select from "@/components/Select";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
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
      try {
        await ensureSession();
      } catch (error) {
        console.error(error);
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

      if (!error) setTasks(normalizeTasks(data ?? []));
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

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Tutti i task"
            subtitle={loading ? "Caricamento..." : `${totalCount} task attivi`}
          />

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
              <Section title="💼 Lavoro" items={work} />
              <Section title="🏡 Personale" items={personal} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Section({ title, items }: { title: string; items: Task[] }) {
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
                ? "📥 Inbox"
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
              <ListRow key={t.id} className="list-row-lg list-row-start">
                <div className="flex items-start justify-between gap-3 w-full">
                  <div>
                    <Link
                      className="link-primary"
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`badge-pill priority-pill priority-${priorityMeta.tone} px-2 py-1`}
                    >
                      {priorityMeta.emoji} {priorityMeta.label}
                    </span>
                    <span
                      className={`badge-pill status-pill status-${statusTone} px-2 py-1`}
                    >
                      {formatStatusLabel(t.status, hasWorkDays)}
                    </span>
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
