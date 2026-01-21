"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import DatePicker from "@/components/DatePicker";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import Select from "@/components/Select";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { emitTasksUpdated } from "@/lib/taskEvents";
import {
  formatTypeLabel,
  getPriorityMeta,
  normalizeTask,
  normalizeTasks,
  formatDisplayDate,
  joinMeta,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
  type Project,
  type Task,
  type TaskPriority,
  type TaskType,
} from "@/lib/tasks";

const NEW_PROJECT_VALUE = "__new_project__";

export default function InboxPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [planDates, setPlanDates] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("WORK");
  const [priority, setPriority] = useState<TaskPriority>("P2");
  const [projectId, setProjectId] = useState<string>("");
  const [projectDraft, setProjectDraft] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectErr, setProjectErr] = useState<string | null>(null);
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      try {
        const session = await ensureSession();
        if (!session) {
          setLoading(false);
          return;
        }
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Errore sessione.");
        setLoading(false);
        return;
      }

      const [{ data, error }, { data: projectsData }] = await Promise.all([
        supabase
          .from("tasks")
          .select(
            "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
          )
          .eq("status", "INBOX")
          .order("priority", { ascending: true, nullsFirst: false })
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("projects").select("id,name").order("name"),
      ]);

      if (!active) return;

      if (error) console.error(error);
      setTasks(normalizeTasks(data ?? []));
      setProjects((projectsData ?? []) as Project[]);
      setLoading(false);
    }

    run();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const trimmed = title.trim();
    if (!trimmed) {
      setErr("Inserisci un titolo.");
      setSaving(false);
      titleRef.current?.focus();
      setExpanded(true);
      return;
    }

    const normalizedWorkDays =
      workDays.length > 0 ? Array.from(new Set(workDays)).sort() : null;

    const payload: Record<string, unknown> = {
      title: trimmed,
      type,
      priority,
      status: normalizedWorkDays ? "OPEN" : "INBOX",
      project_id:
        projectId && projectId !== NEW_PROJECT_VALUE ? projectId : null,
      work_days: normalizedWorkDays,
    };

    if (dueDate) payload.due_date = dueDate;

    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select(
        "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
      )
      .single();

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setToast(
      normalizedWorkDays ? "Task pianificato." : "Task aggiunto in Inbox."
    );
    if (data && data.status === "INBOX") {
      setTasks((prev) => [normalizeTask(data), ...prev]);
    }
    emitTasksUpdated();

    setTitle("");
    setWorkDays([]);
    setDueDate("");
    setProjectId("");
    setPriority("P2");
    titleRef.current?.focus();
  }

  async function createInlineProject() {
    setProjectErr(null);
    const trimmed = projectDraft.trim();
    if (!trimmed) {
      setProjectErr("Inserisci un nome progetto.");
      return;
    }

    setProjectSaving(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: trimmed })
      .select("id,name")
      .single();
    setProjectSaving(false);

    if (error || !data) {
      setProjectErr(error?.message ?? "Errore nel salvataggio.");
      return;
    }

    setProjects((prev) =>
      [...prev, data as Project].sort((a, b) => a.name.localeCompare(b.name))
    );
    setProjectId(data.id);
    setProjectDraft("");
    setProjectErr(null);
    router.refresh();
  }

  function handleProjectChange(next: string) {
    setProjectErr(null);
    setProjectId(next);
  }

  async function scheduleTask(id: string, dates: string[]) {
    if (!dates || dates.length === 0) {
      setErr("Seleziona almeno un giorno per pianificare.");
      return;
    }

    setErr(null);
    setSchedulingId(id);
    const normalized = Array.from(new Set(dates)).sort();
    const { error } = await supabase
      .from("tasks")
      .update({ status: "OPEN", work_days: normalized })
      .eq("id", id);

    setSchedulingId(null);
    if (error) {
      setErr(error.message);
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== id));
    setPlanDates((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const total = useMemo(() => tasks.length, [tasks]);
  const projectOptions = useMemo(
    () => [
      { value: "", label: "🗂️ Nessun progetto" },
      { value: NEW_PROJECT_VALUE, label: "➕ Nuovo progetto" },
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
            title="Cattura"
            subtitle={loading ? "Caricamento..." : `${total} task da pianificare`}
          />

          <section className="mt-8 glass-panel p-5">
            <form onSubmit={createTask} className="space-y-3">
              <div>
                <input
                  ref={titleRef}
                  className="glass-input px-4 py-3 capture-title"
                  value={title}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setTitle(nextValue);
                    setExpanded((prev) => prev || nextValue.trim().length > 0);
                  }}
                  onFocus={() => setExpanded(true)}
                  placeholder="Cosa devi fare?"
                  required
                  autoFocus
                  aria-label="Titolo"
                />
              </div>

              <div
                className="capture-reveal space-y-4"
                data-open={expanded ? "true" : "false"}
                aria-hidden={!expanded}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <Select
                      value={type}
                      onChange={(next) => setType(next as TaskType)}
                      options={TYPE_OPTIONS}
                      placeholder="Tipo"
                      ariaLabel="Tipo"
                      showToneDot={false}
                    />
                  </div>
                  <div className="field-soft">
                    <Select
                      value={priority}
                      onChange={(next) =>
                        setPriority(next as TaskPriority)
                      }
                      options={PRIORITY_OPTIONS}
                      placeholder="Priorita"
                      ariaLabel="Priorita"
                      showToneDot={false}
                    />
                  </div>
                  <div className="field-soft">
                    <Select
                      value={projectId}
                      onChange={handleProjectChange}
                      options={projectOptions}
                      placeholder="Progetto"
                      ariaLabel="Progetto"
                    />
                  </div>
                </div>

                {projectId === NEW_PROJECT_VALUE && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="glass-input px-3 py-2 flex-1 min-w-[200px]"
                      value={projectDraft}
                      onChange={(event) => setProjectDraft(event.target.value)}
                      placeholder="Nome progetto"
                      aria-label="Nome progetto"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      onClick={createInlineProject}
                      disabled={projectSaving}
                    >
                      {projectSaving ? "Creo..." : "Crea"}
                    </Button>
                    <Button
                      variant="tertiary"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setProjectId("");
                        setProjectDraft("");
                        setProjectErr(null);
                      }}
                    >
                      Annulla
                    </Button>
                  </div>
                )}
                {projectErr && (
                  <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                    {projectErr}
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <DatePicker
                      mode="multiple"
                      value={workDays}
                      onChange={(next) => setWorkDays(next)}
                      inputClassName="px-3 py-2"
                      placeholder="Giorni di lavoro"
                      ariaLabel="Giorni di lavoro"
                    />
                  </div>
                  <div>
                    <DatePicker
                      value={dueDate}
                      onChange={(next) => setDueDate(next)}
                      inputClassName="px-3 py-2"
                      placeholder="Scadenza"
                      ariaLabel="Scadenza"
                    />
                  </div>
                </div>

                {err && (
                  <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                    {err}
                  </p>
                )}

                <Button
                  variant="primary"
                  size="md"
                  disabled={saving || title.trim().length === 0}
                  type="submit"
                  icon={<Icon name="plus" />}
                  className="capture-submit"
                >
                  {saving ? "Salvo..." : "Aggiungi task"}
                </Button>

                {toast && (
                  <div className="toast" role="status" aria-live="polite">
                    {toast}
                  </div>
                )}
              </div>
            </form>
          </section>

          <section className="mt-8">
            <SectionHeader
              title="Inbox da pianificare"
              subtitle="Seleziona il giorno di lavoro per spostarli in Pianificati."
            />
            {loading ? (
              <SkeletonList rows={3} />
            ) : tasks.length === 0 ? (
              <EmptyState
                title="Nessun task in Inbox"
                description="Quando aggiungi un task senza data lo troverai qui."
              />
            ) : (
              <ul className="mt-4 list-stack">
                {tasks.map((task) => {
                  const meta = joinMeta([
                    task.project?.name ?? null,
                    task.due_date
                      ? `Scadenza: ${formatDisplayDate(task.due_date)}`
                      : null,
                  ]);
                  const priorityMeta = getPriorityMeta(task.priority);
                  return (
                    <ListRow key={task.id} className="list-row-lg list-row-start">
                      <div className="flex items-start justify-between gap-3 w-full">
                        <div className="min-w-0">
                          <Link
                            href={`/task/${task.id}`}
                            className="link-primary stretched-link"
                          >
                            {task.title}
                          </Link>
                          {meta ? <p className="meta-line mt-1">{meta}</p> : null}
                          <div className="mt-2 max-w-xs stretched-guard">
                            <DatePicker
                              value={planDates[task.id] ?? ""}
                              onChange={(next) => {
                                setPlanDates((prev) => ({
                                  ...prev,
                                  [task.id]: next,
                                }));
                                if (next) {
                                  scheduleTask(task.id, [next]);
                                }
                              }}
                              inputClassName="px-3 py-2"
                              placeholder="Pianifica giorno"
                              ariaLabel="Pianifica giorno"
                              disabled={schedulingId === task.id}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`badge-pill priority-pill priority-${priorityMeta.tone} px-2 py-1`}
                          >
                            {priorityMeta.emoji} {priorityMeta.label}
                          </span>
                          <span
                            className={`badge-pill type-pill ${
                              task.type === "WORK"
                                ? "type-work"
                                : "type-personal"
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
          </section>
        </div>
      </main>
    </>
  );
}
