"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TYPE_BUTTON_LABELS, UI } from "@/lib/constants";
import DatePicker from "@/components/DatePicker";
import Select from "@/components/Select";
import { supabase } from "@/lib/supabaseClient";
import { emitTasksUpdated } from "@/lib/taskEvents";
import {
  PRIORITY_OPTIONS,
  type Project,
  type Task,
  type TaskPriority,
  type TaskType,
} from "@/lib/tasks";

type TaskEditModalProps = {
  open: boolean;
  task: Task | null;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
};

export default function TaskEditModal({
  open,
  task,
  projects,
  onClose,
  onSaved,
}: TaskEditModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("WORK");
  const [priority, setPriority] = useState<TaskPriority>("P2");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [workDaysDraft, setWorkDaysDraft] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const normalizedDraftWorkDays = useMemo(
    () => Array.from(new Set(workDaysDraft)).sort(),
    [workDaysDraft]
  );
  const normalizedWorkDays = useMemo(
    () => Array.from(new Set(workDays)).sort(),
    [workDays]
  );
  const hasPendingWorkDays = useMemo(
    () =>
      normalizedDraftWorkDays.join("|") !== normalizedWorkDays.join("|"),
    [normalizedDraftWorkDays, normalizedWorkDays]
  );

  const projectOptions = useMemo(
    () => [
      { value: "", label: "Nessun progetto" },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name.toUpperCase(),
      })),
    ],
    [projects]
  );

  useEffect(() => {
    if (!open || !task) return;

    const timerId = window.setTimeout(() => {
      setTitle(task.title);
      setType(task.type);
      setPriority(task.priority ?? "P2");
      setProjectId(task.project_id ?? "");
      setDueDate(task.due_date ?? "");
      setWorkDays(task.work_days ?? []);
      setWorkDaysDraft(task.work_days ?? []);
      setNotes(task.notes ?? "");
      setErr(null);
      setSaving(false);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [open, task]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose, saving]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || saving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErr("Inserisci il titolo.");
      return;
    }
    if (hasPendingWorkDays) {
      setErr("Conferma i giorni di lavoro prima di salvare.");
      return;
    }

    setErr(null);
    setSaving(true);

    const normalizedDays =
      normalizedWorkDays.length > 0 ? normalizedWorkDays : null;

    const payload: Record<string, unknown> = {
      title: trimmedTitle,
      type,
      status: normalizedDays ? "OPEN" : "INBOX",
      priority,
      project_id: projectId || null,
      due_date: dueDate || null,
      work_days: normalizedDays,
      notes: notes.trim() || null,
    };

    const { error } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", task.id);

    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }

    emitTasksUpdated();
    onSaved();
  }

  if (!open || !task) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="wizard-modal task-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="task-edit-form" onSubmit={handleSubmit}>
          <div className="wizard-heading task-edit-heading">
            <h2 id="task-edit-title" className="section-title">
              Modifica task
            </h2>
          </div>

          <div className="task-edit-fields">
            <input
              className="glass-input wizard-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Titolo task"
              placeholder="Titolo task"
            />

            <div className="wizard-step-details wizard-grid task-edit-grid">
              <Select
                value={priority}
                onChange={(next) => setPriority(next as TaskPriority)}
                options={PRIORITY_OPTIONS}
                placeholder="Criticità"
                ariaLabel="Criticità"
                showToneDot={false}
                className={`wizard-control-select wizard-priority-field wizard-priority-${priority.toLowerCase()}`}
              />
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                placeholder="Progetto"
                ariaLabel="Progetto"
                className="wizard-control-select"
              />
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                placeholder="Scadenza"
                ariaLabel="Scadenza"
                wrapperClassName="wizard-control-date"
                inputClassName="wizard-control-input"
              />
              <DatePicker
                mode="multiple"
                value={workDaysDraft}
                onChange={(next) => {
                  setWorkDaysDraft(next);
                  setErr(null);
                }}
                onConfirm={(next) => {
                  setWorkDays(Array.from(new Set(next)).sort());
                  setErr(null);
                }}
                confirmLabel="✓"
                placeholder="Quando ci lavori?"
                ariaLabel="Quando ci lavori"
                wrapperClassName="wizard-control-date"
                inputClassName="wizard-control-input"
              />
            </div>

            <input
              className="glass-input wizard-control-input wizard-notes-input task-edit-notes-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Note"
              aria-label="Note"
            />
          </div>

          {err ? <p className="wizard-inline-error">{err}</p> : null}

          <div className="task-edit-footer">
            <div className="wizard-type-switch" role="tablist" aria-label="Tipo task">
              <button
                type="button"
                className={`wizard-type-btn ${type === "WORK" ? "is-active" : ""}`}
                onClick={() => setType("WORK")}
                role="tab"
                aria-selected={type === "WORK"}
              >
                {TYPE_BUTTON_LABELS.WORK}
              </button>
              <button
                type="button"
                className={`wizard-type-btn ${type === "PERSONAL" ? "is-active" : ""}`}
                onClick={() => setType("PERSONAL")}
                role="tab"
                aria-selected={type === "PERSONAL"}
              >
                {TYPE_BUTTON_LABELS.PERSONAL}
              </button>
            </div>

            <div className="task-edit-actions">
              <button
                type="button"
                className="wizard-cancel-link"
                onClick={onClose}
                disabled={saving}
              >
                {UI.CANCEL}
              </button>
              <button
                type="submit"
                className="wizard-forward-btn is-submit task-edit-save-btn"
                disabled={saving}
              >
                {saving ? UI.SAVING : UI.SAVE}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
