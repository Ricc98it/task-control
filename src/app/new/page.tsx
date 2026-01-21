"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type Project,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
  TYPE_OPTIONS,
} from "@/lib/tasks";

export default function NewTaskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("WORK");
  const [status, setStatus] = useState<TaskStatus>("OPEN");
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority>("P2");
  const [projectId, setProjectId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
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
  const statusOptions = useMemo(
    () => STATUS_OPTIONS.filter((option) => option.value !== "DONE"),
    [STATUS_OPTIONS]
  );

  useEffect(() => {
    async function loadProjects() {
      try {
        const session = await ensureSession();
        if (!session) {
          setErr("Accedi per continuare.");
          return;
        }
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Errore sessione.");
        return;
      }
      const { data } = await supabase
        .from("projects")
        .select("id,name")
        .order("name");
      setProjects((data ?? []) as Project[]);
    }

    loadProjects();
  }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

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
    };

    if (dueDate) payload.due_date = dueDate;

    const { error } = await supabase.from("tasks").insert(payload);

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    emitTasksUpdated();
    router.push("/today");
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Nuovo task"
            subtitle="Crea un task pronto per inbox o pianificazione."
          />

          <form onSubmit={createTask} className="mt-6 space-y-6">
            <div className="form-section">
              <SectionHeader
                title="Dettagli"
                subtitle="Titolo, tipo e priorita"
              />
              <div className="mt-4 space-y-4">
                <div>
                  <input
                    className="glass-input px-4 py-2"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titolo (es. Chiudere slide BEKO)"
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
                </div>
              </div>
            </div>

            <div className="form-section">
              <SectionHeader title="Contesto" subtitle="Note e dettagli" />
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

            {err && (
              <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                {err}
              </p>
            )}

            <Button
              variant="primary"
              size="md"
              disabled={loading}
              type="submit"
              icon={<Icon name="plus" />}
            >
              {loading ? "Creo..." : "Crea task"}
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
