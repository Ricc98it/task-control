"use client";

import Link from "next/link";
import Nav from "@/components/Nav";
import DatePicker from "@/components/DatePicker";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import Select from "@/components/Select";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import {
  formatDisplayDate,
  getPriorityMeta,
  joinMeta,
  normalizeTasks,
  PRIORITY_OPTIONS,
  type Project,
  type Task,
  type TaskPriority,
  type TaskType,
  TYPE_OPTIONS,
} from "@/lib/tasks";

type SessionState = "loading" | "authed" | "anon";
const NEW_PROJECT_VALUE = "__new_project__";

export default function HomePage() {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickType, setQuickType] = useState<TaskType>("WORK");
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("P2");
  const [quickProject, setQuickProject] = useState<string>("");
  const [quickProjectDraft, setQuickProjectDraft] = useState("");
  const [quickProjectSaving, setQuickProjectSaving] = useState(false);
  const [quickProjectErr, setQuickProjectErr] = useState<string | null>(null);
  const [quickWorkDays, setQuickWorkDays] = useState<string[]>([]);
  const [quickDueDate, setQuickDueDate] = useState<string>("");
  const [quickErr, setQuickErr] = useState<string | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickExpanded, setQuickExpanded] = useState(true);
  const [quickToast, setQuickToast] = useState<string | null>(null);
  const quickTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    ensureSession()
      .then((session) => {
        if (!active) return;
        setSessionState(session ? "authed" : "anon");
      })
      .catch(() => {
        if (!active) return;
        setSessionState("anon");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authed") return;
    let active = true;

    async function loadHomeData() {
      const [upcomingRes, projectsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select(
            "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
          )
          .eq("status", "OPEN")
          .not("due_date", "is", null)
          .order("due_date", { ascending: true })
          .limit(5),
        supabase.from("projects").select("id,name").order("name"),
      ]);

      if (!active) return;

      setUpcoming(normalizeTasks(upcomingRes.data ?? []));
      setProjects((projectsRes.data ?? []) as Project[]);
    }

    loadHomeData();

    return () => {
      active = false;
    };
  }, [sessionState]);

  useEffect(() => {
    if (!quickToast) return;
    const timeout = setTimeout(() => setQuickToast(null), 2200);
    return () => clearTimeout(timeout);
  }, [quickToast]);

  async function createQuickTask(e: React.FormEvent) {
    e.preventDefault();
    setQuickErr(null);

    const trimmed = quickTitle.trim();
    if (!trimmed) {
      setQuickErr("Inserisci un titolo.");
      quickTitleRef.current?.focus();
      setQuickExpanded(true);
      return;
    }

    setQuickSaving(true);

    const normalizedWorkDays =
      quickWorkDays.length > 0 ? Array.from(new Set(quickWorkDays)).sort() : null;

    const payload: Record<string, unknown> = {
      title: trimmed,
      type: quickType,
      priority: quickPriority,
      status: normalizedWorkDays ? "OPEN" : "INBOX",
      work_days: normalizedWorkDays,
      project_id:
        quickProject && quickProject !== NEW_PROJECT_VALUE
          ? quickProject
          : null,
    };

    if (quickDueDate) payload.due_date = quickDueDate;

    const { error } = await supabase.from("tasks").insert(payload);

    setQuickSaving(false);

    if (error) {
      setQuickErr(error.message);
      return;
    }

    setQuickToast(
      normalizedWorkDays ? "Task pianificato." : "Task aggiunto in Inbox."
    );
    setQuickTitle("");
    setQuickWorkDays([]);
    setQuickDueDate("");
    setQuickProject("");
    setQuickPriority("P2");
    quickTitleRef.current?.focus();
  }

  async function createQuickProject() {
    setQuickProjectErr(null);
    const trimmed = quickProjectDraft.trim();
    if (!trimmed) {
      setQuickProjectErr("Inserisci un nome progetto.");
      return;
    }

    setQuickProjectSaving(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: trimmed })
      .select("id,name")
      .single();
    setQuickProjectSaving(false);

    if (error || !data) {
      setQuickProjectErr(error?.message ?? "Errore nel salvataggio.");
      return;
    }

    setProjects((prev) =>
      [...prev, data as Project].sort((a, b) => a.name.localeCompare(b.name))
    );
    setQuickProject(data.id);
    setQuickProjectDraft("");
    setQuickProjectErr(null);
  }

  function handleQuickProjectChange(next: string) {
    setQuickProjectErr(null);
    setQuickProject(next);
  }

  const isAuthed = sessionState === "authed";
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
        <div className="app-shell max-w-5xl mx-auto">
          <div className="px-8 pt-8">
            <PageHeader
              title="Home"
              subtitle="Centro di controllo per cattura, pianificazione e focus."
              right={
                isAuthed ? (
                  <>
                    <Link href="/today" className="btn-secondary px-4 py-2 text-sm">
                      <Icon name="calendar" />
                      Vai a Oggi
                    </Link>
                    <Link href="/new" className="btn-primary px-4 py-2 text-sm">
                      <Icon name="plus" />
                      Nuovo task
                    </Link>
                  </>
                ) : (
                  <Link href="/login" className="btn-primary px-4 py-2 text-sm">
                    Accedi
                  </Link>
                )
              }
            />
          </div>

          {isAuthed ? (
            <section className="px-8 py-10">
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className="glass-panel p-5">
                  <form onSubmit={createQuickTask} className="space-y-3">
                    <div>
                      <input
                        ref={quickTitleRef}
                        className="glass-input px-4 py-3 capture-title"
                        value={quickTitle}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setQuickTitle(nextValue);
                          setQuickExpanded(
                            (prev) => prev || nextValue.trim().length > 0
                          );
                        }}
                        onFocus={() => setQuickExpanded(true)}
                        placeholder="Cosa devi fare?"
                        required
                        autoFocus
                        aria-label="Titolo"
                      />
                    </div>

                    <div
                      className="capture-reveal space-y-4"
                      data-open={quickExpanded ? "true" : "false"}
                      aria-hidden={!quickExpanded}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Select
                            value={quickType}
                            onChange={(next) =>
                              setQuickType(next as TaskType)
                            }
                            options={TYPE_OPTIONS}
                            placeholder="Tipo"
                            ariaLabel="Tipo"
                            showToneDot={false}
                          />
                        </div>
                        <div className="field-soft">
                          <Select
                            value={quickPriority}
                            onChange={(next) =>
                              setQuickPriority(next as TaskPriority)
                            }
                            options={PRIORITY_OPTIONS}
                            placeholder="Priorita"
                            ariaLabel="Priorita"
                            showToneDot={false}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="field-soft">
                          <Select
                            value={quickProject}
                            onChange={handleQuickProjectChange}
                            options={projectOptions}
                            placeholder="Progetto"
                            ariaLabel="Progetto"
                          />
                        </div>
                        <div>
                          <DatePicker
                            mode="multiple"
                            value={quickWorkDays}
                            onChange={(next) => setQuickWorkDays(next)}
                            inputClassName="px-3 py-2"
                            placeholder="Giorni di lavoro"
                            ariaLabel="Giorni di lavoro"
                          />
                        </div>
                      </div>

                      {quickProject === NEW_PROJECT_VALUE && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="glass-input px-3 py-2 flex-1 min-w-[200px]"
                            value={quickProjectDraft}
                            onChange={(event) =>
                              setQuickProjectDraft(event.target.value)
                            }
                            placeholder="Nome progetto"
                            aria-label="Nome progetto"
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            type="button"
                            onClick={createQuickProject}
                            disabled={quickProjectSaving}
                          >
                            {quickProjectSaving ? "Creo..." : "Crea"}
                          </Button>
                          <Button
                            variant="tertiary"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setQuickProject("");
                              setQuickProjectDraft("");
                              setQuickProjectErr(null);
                            }}
                          >
                            Annulla
                          </Button>
                        </div>
                      )}
                      {quickProjectErr && (
                        <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                          {quickProjectErr}
                        </p>
                      )}

                      <div>
                        <DatePicker
                          value={quickDueDate}
                          onChange={(next) => setQuickDueDate(next)}
                          inputClassName="px-3 py-2"
                          placeholder="Scadenza"
                          ariaLabel="Scadenza"
                        />
                      </div>

                      {quickErr && (
                        <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                          {quickErr}
                        </p>
                      )}

                      <Button
                        variant="primary"
                        size="md"
                        disabled={quickSaving || quickTitle.trim().length === 0}
                        type="submit"
                        icon={<Icon name="plus" />}
                        className="capture-submit"
                      >
                        {quickSaving ? "Salvo..." : "Aggiungi task"}
                      </Button>

                      {quickToast && (
                        <div className="toast" role="status" aria-live="polite">
                          {quickToast}
                        </div>
                      )}
                    </div>
                  </form>
                </div>

                <div className="glass-panel p-5">
                  <SectionHeader title="Scadenze in arrivo" subtitle="Focus" />

                  {upcoming.length === 0 ? (
                    <EmptyState
                      title="Nessuna scadenza in arrivo"
                      description="Programma un task con data per vederlo qui."
                    />
                  ) : (
                    <ul className="mt-4 list-stack">
                      {upcoming.map((task) => {
                        const meta = joinMeta([
                          task.due_date
                            ? `Scadenza: ${formatDisplayDate(task.due_date)}`
                            : null,
                          task.project?.name ?? null,
                        ]);
                        const priorityMeta = getPriorityMeta(task.priority);
                        return (
                          <ListRow key={task.id} className="list-row-lg">
                            <div className="min-w-0">
                              <Link
                                href={`/task/${task.id}`}
                                className="link-primary"
                              >
                                {task.title}
                              </Link>
                              <p className="meta-line mt-1">{meta}</p>
                            </div>
                            <span
                              className={`badge-pill priority-pill priority-${priorityMeta.tone} px-2 py-1`}
                            >
                              {priorityMeta.emoji} {priorityMeta.label}
                            </span>
                          </ListRow>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="px-8 py-10">
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
    </>
  );
}
