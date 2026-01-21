"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import EmptyState from "@/components/EmptyState";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import Select from "@/components/Select";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import {
  formatTypeLabel,
  formatDisplayDate,
  getPriorityMeta,
  joinMeta,
  normalizeTasks,
  type Project,
  type Task,
  type TaskType,
  TYPE_OPTIONS,
} from "@/lib/tasks";

export default function DonePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"ALL" | TaskType>("ALL");
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
        .eq("status", "DONE")
        .order("work_days", { ascending: false, nullsFirst: false });

      if (typeFilter !== "ALL") {
        query = query.eq("type", typeFilter);
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
  }, [typeFilter, projectFilter]);

  const total = useMemo(() => tasks.length, [tasks]);
  const typeFilterOptions = useMemo(
    () => [{ value: "ALL", label: "✨ Tutti" }, ...TYPE_OPTIONS],
    [TYPE_OPTIONS]
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
            title="Completati"
            subtitle={loading ? "Caricamento..." : `${total} task completati`}
          />

          <div className="mt-6 glass-panel p-4">
            <SectionHeader title="Filtri" subtitle="Rivedi i completati" />
            <div className="grid gap-3 sm:grid-cols-2">
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
          ) : tasks.length === 0 ? (
            <EmptyState
              title="Nessun task completato ancora"
              description="Quando chiudi un task lo troverai qui."
            />
          ) : (
            <ul className="mt-6 list-stack">
              {tasks.map((task) => {
                const priorityMeta = getPriorityMeta(task.priority);
                return (
                  <ListRow key={task.id} className="list-row-lg list-row-start">
                    <div className="flex items-start justify-between gap-3 w-full">
                      <div>
                        <Link
                          className="link-primary stretched-link"
                          href={`/task/${task.id}`}
                        >
                          {task.title}
                        </Link>
                        <p className="meta-line mt-1">
                          {joinMeta([
                            task.project?.name ?? null,
                            task.work_days && task.work_days.length > 0
                              ? `Giorni: ${task.work_days
                                  .slice(0, 2)
                                  .map((day) => formatDisplayDate(day))
                                  .join(", ")}${
                                  task.work_days.length > 2
                                    ? ` +${task.work_days.length - 2}`
                                    : ""
                                }`
                              : null,
                          ])}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`badge-pill priority-pill priority-${priorityMeta.tone} px-2 py-1`}
                        >
                          {priorityMeta.emoji} {priorityMeta.label}
                        </span>
                        <span
                          className={`badge-pill type-pill ${
                            task.type === "WORK" ? "type-work" : "type-personal"
                          } px-2 py-1`}
                        >
                          {formatTypeLabel(task.type)}
                        </span>
                      </div>
                    </div>
                  </ListRow>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
