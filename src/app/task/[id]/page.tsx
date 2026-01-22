"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import DatePicker from "@/components/DatePicker";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import Select from "@/components/Select";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { emitTasksUpdated } from "@/lib/taskEvents";
import {
  formatStatusLabel,
  formatISODate,
  getStatusMeta,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  todayISO,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
  TYPE_OPTIONS,
  normalizeTask,
} from "@/lib/tasks";

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("WORK");
  const [status, setStatus] = useState<TaskStatus>("OPEN");
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("P2");
  const [projectId, setProjectId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const projectOptions = useMemo(
    () => [
      { value: "", label: "🗂️ Nessun progetto" },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [projects]
  );
  const statusOptions = useMemo(() => STATUS_OPTIONS, [STATUS_OPTIONS]);

  useEffect(() => {
    async function load() {
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

      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
        )
        .eq("id", id)
        .single();

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setErr("Task non trovato.");
        setLoading(false);
        return;
      }

      const t = normalizeTask(data);
      setTask(t);
      setTitle(t.title);
      setType(t.type);
      setStatus(t.status);
      setWorkDays(t.work_days ?? []);
      setDueDate(t.due_date ?? "");
      setPriority(t.priority ?? "P2");
      setProjectId(t.project_id ?? "");
      setNotes(t.notes ?? "");
      setLoading(false);
    }

    load();
  }, [id, router]);

  useEffect(() => {
    async function loadProjects() {
      const { data } = await supabase
        .from("projects")
        .select("id,name")
        .order("name");
      setProjects((data ?? []) as Project[]);
    }

    loadProjects();
  }, []);

  async function deleteTask(nextPath: string) {
    if (!task) return;
    setErr(null);
    setSaving(true);

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id);

    setSaving(false);
    if (error) setErr(error.message);
    else {
      emitTasksUpdated();
      router.push(nextPath);
    }
  }

  async function save() {
    if (!task) return;
    if (status === "DONE") {
      await deleteTask("/all");
      return;
    }

    setErr(null);
    setSaving(true);

    const normalizedWorkDays =
      status === "INBOX"
        ? null
        : workDays.length > 0
        ? Array.from(new Set(workDays)).sort()
        : null;

    const payload: Record<string, unknown> = {
      title: title.trim(),
      type,
      status,
      priority,
      project_id: projectId || null,
      notes: notes.trim() || null,
      work_days: normalizedWorkDays,
      due_date: dueDate ? dueDate : null,
    };

    const { error } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", task.id);

    setSaving(false);
    if (error) setErr(error.message);
    else router.push("/all");
  }

  async function complete() {
    await deleteTask("/today"); // completato = eliminato
  }

  async function sendToToday() {
    if (!task) return;
    setErr(null);
    setSaving(true);
    const today = todayISO();
    const nextDays = Array.from(new Set([today, ...workDays])).sort();
    const { error } = await supabase
      .from("tasks")
      .update({ status: "OPEN", work_days: nextDays })
      .eq("id", task.id);
    setSaving(false);
    if (error) setErr(error.message);
    else {
      setStatus("OPEN");
      setWorkDays(nextDays);
    }
  }

  async function sendToInbox() {
    if (!task) return;
    setErr(null);
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({ status: "INBOX", work_days: null })
      .eq("id", task.id);
    setSaving(false);
    if (error) setErr(error.message);
    else {
      setStatus("INBOX");
      setWorkDays([]);
    }
  }

  async function snoozeDay() {
    if (!task || workDays.length === 0) return;
    setErr(null);
    setSaving(true);
    const nextDays = workDays
      .map((day) => {
        const date = new Date(day);
        date.setDate(date.getDate() + 1);
        return formatISODate(date);
      })
      .sort();
    const { error } = await supabase
      .from("tasks")
      .update({ work_days: nextDays })
      .eq("id", task.id);
    setSaving(false);
    if (error) setErr(error.message);
    else setWorkDays(nextDays);
  }

  const statusLabel = useMemo(
    () => formatStatusLabel(status, workDays.length > 0),
    [status, workDays.length]
  );
  const statusTone = useMemo(() => getStatusMeta(status).tone, [status]);

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10 app-page">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Dettagli task"
            subtitle="Gestisci contenuto e pianificazione."
            right={
              <span
                className={`pill status-pill status-${statusTone}`.trim()}
              >
                {statusLabel}
              </span>
            }
          />

          {loading ? (
            <p className="meta-line mt-6">Caricamento...</p>
          ) : !task ? (
            <p className="mt-6 text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
              {err ?? "Task non trovato."}
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {err && (
                <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                  {err}
                </p>
              )}
              <div className="form-section">
                <SectionHeader title="Dettagli" subtitle="Titolo e priorita" />
                <div className="mt-4 space-y-4">
                  <div>
                    <input
                      className="glass-input px-4 py-2"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Titolo"
                      required
                      aria-label="Titolo"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Select
                        value={type}
                        onChange={(next) => setType(next as TaskType)}
                        options={TYPE_OPTIONS}
                        placeholder="Tipo"
                        ariaLabel="Tipo"
                      />
                    </div>

                    <div>
                      <Select
                        value={priority}
                        onChange={(next) =>
                          setPriority(next as TaskPriority)
                        }
                        options={PRIORITY_OPTIONS}
                        placeholder="Priorita"
                        ariaLabel="Priorita"
                      />
                    </div>

                    <div>
                      <Select
                        value={projectId}
                        onChange={setProjectId}
                        options={projectOptions}
                        placeholder="Progetto"
                        ariaLabel="Progetto"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <SectionHeader title="Pianificazione" subtitle="Stato e date" />
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Select
                      value={status}
                      onChange={(next) => {
                        const nextStatus = next as TaskStatus;
                        setStatus(nextStatus);
                        if (nextStatus === "INBOX") {
                          setWorkDays([]);
                        }
                      }}
                      options={statusOptions}
                      placeholder="Stato"
                      ariaLabel="Stato"
                    />
                  </div>

                  <div>
                    <DatePicker
                      mode="multiple"
                      value={status === "INBOX" ? [] : workDays}
                      onChange={(next) => setWorkDays(next)}
                      disabled={status === "INBOX"}
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
                      placeholder="Scadenza (opz.)"
                      ariaLabel="Scadenza"
                    />
                    <p className="meta-line mt-2">
                      Lascia vuoto per rimuoverla.
                    </p>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <SectionHeader title="Note" subtitle="Contesto utile" />
                <div className="mt-4">
                  <input
                    className="glass-input px-3 py-2"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Note (opz.)"
                    aria-label="Note"
                  />
                </div>
              </div>

              <div className="button-group pt-2">
                <Button
                  onClick={save}
                  variant="primary"
                  size="md"
                  disabled={saving}
                  icon={<Icon name="check" />}
                >
                  {saving ? "Salvo..." : "Salva"}
                </Button>

                <Button
                  onClick={complete}
                  variant="secondary"
                  size="md"
                  disabled={saving}
                  icon={<Icon name="check" />}
                >
                  Segna completato
                </Button>

                <Button
                  onClick={sendToToday}
                  variant="secondary"
                  size="md"
                  disabled={saving}
                  icon={<Icon name="calendar" />}
                >
                  Sposta a oggi
                </Button>

                <Button
                  onClick={snoozeDay}
                  variant="secondary"
                  size="md"
                  disabled={saving || workDays.length === 0}
                  icon={<Icon name="arrow-right" />}
                >
                  Rimanda di 1 giorno
                </Button>

                <Button
                  onClick={sendToInbox}
                  variant="secondary"
                  size="md"
                  disabled={saving}
                  icon={<Icon name="inbox" />}
                >
                  Metti da pianificare
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
