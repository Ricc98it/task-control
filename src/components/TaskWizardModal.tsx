"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type TouchEvent,
} from "react";
import DatePicker from "@/components/DatePicker";
import Icon from "@/components/Icon";
import Select from "@/components/Select";
import { ensureSession } from "@/lib/autoSession";
import { supabase } from "@/lib/supabaseClient";
import { emitTasksUpdated } from "@/lib/taskEvents";
import { useIsMobile } from "@/lib/useIsMobile";
import { TYPE_BUTTON_LABELS, UI } from "@/lib/constants";
import {
  PRIORITY_OPTIONS,
  type Project,
  type TaskPriority,
  type TaskType,
} from "@/lib/tasks";

type TaskWizardModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

type WizardStep = 1 | 2 | 3;
const NEW_PROJECT_PREFIX = "__new__:";

export default function TaskWizardModal({
  open,
  onClose,
  onCreated,
}: TaskWizardModalProps) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState<WizardStep>(1);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("WORK");
  const [workDaysDraft, setWorkDaysDraft] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [projectId, setProjectId] = useState<string>("");
  const [pendingProjectName, setPendingProjectName] = useState("");
  const [notes, setNotes] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [titleInvalidFlash, setTitleInvalidFlash] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleFlashTimerRef = useRef<number | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

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
    () => {
      const baseOptions = projects.map((project) => ({
        value: project.id,
        label: project.name.toUpperCase(),
      }));
      if (!pendingProjectName.trim()) return baseOptions;
      return [
        {
          value: `${NEW_PROJECT_PREFIX}${pendingProjectName.trim()}`,
          label: pendingProjectName.trim().toUpperCase(),
          description: "Nuovo progetto",
        },
        ...baseOptions,
      ];
    },
    [pendingProjectName, projects]
  );

  const resetWizard = useCallback(() => {
    setStep(1);
    setTitle("");
    setType("WORK");
    setWorkDaysDraft([]);
    setWorkDays([]);
    setDueDate("");
    setPriority("");
    setProjectId("");
    setPendingProjectName("");
    setNotes("");
    setLoadingProjects(true);
    setErr(null);
    setSaving(false);
    setTitleInvalidFlash(false);
    if (titleFlashTimerRef.current !== null) {
      window.clearTimeout(titleFlashTimerRef.current);
      titleFlashTimerRef.current = null;
    }
  }, []);

  const closeAndReset = useCallback(() => {
    resetWizard();
    onClose();
  }, [onClose, resetWizard]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    ensureSession()
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          setErr("Accedi per continuare.");
          setLoadingProjects(false);
          return;
        }

        const { data, error } = await supabase
          .from("projects")
          .select("id,name")
          .order("name");

        if (!active) return;

        if (error) {
          setErr(error.message);
          setProjects([]);
        } else {
          setProjects((data ?? []) as Project[]);
        }
        setLoadingProjects(false);
      })
      .catch((error) => {
        if (!active) return;
        setErr(error instanceof Error ? error.message : "Errore sessione.");
        setLoadingProjects(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAndReset();
      }
    }

    function handleEnter(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest(".date-popover, .select-menu")) return;
      if (document.querySelector(".date-overlay, .select-menu")) return;

      event.preventDefault();
      if (saving) return;
      formRef.current?.requestSubmit();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("keydown", handleEnter);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("keydown", handleEnter);
    };
  }, [open, closeAndReset, saving]);

  useEffect(() => {
    return () => {
      if (titleFlashTimerRef.current !== null) {
        window.clearTimeout(titleFlashTimerRef.current);
      }
    };
  }, []);

  function handleNextStep() {
    if (step === 1) {
      if (!title.trim()) {
        setErr(null);
        setTitleInvalidFlash(false);
        requestAnimationFrame(() => {
          setTitleInvalidFlash(true);
          titleInputRef.current?.focus();
        });
        if (titleFlashTimerRef.current !== null) {
          window.clearTimeout(titleFlashTimerRef.current);
        }
        titleFlashTimerRef.current = window.setTimeout(() => {
          setTitleInvalidFlash(false);
          titleFlashTimerRef.current = null;
        }, 550);
        return;
      }
      setErr(null);
      setStep(2);
      return;
    }

    if (step === 2) {
      if (hasPendingWorkDays) {
        setErr("Conferma i giorni di lavoro prima di proseguire.");
        return;
      }
      setErr(null);
      setStep(3);
    }
  }

  function handlePrevStep() {
    if (saving) return;
    if (step === 1) return;
    setErr(null);
    setStep((prev) => (prev === 3 ? 2 : 1));
  }

  async function createTask() {
    setErr(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErr("Inserisci un titolo.");
      return;
    }

    setSaving(true);

    try {
      const session = await ensureSession();
      if (!session) {
        setErr("Accedi per continuare.");
        setSaving(false);
        return;
      }

      const safeWorkDays =
        normalizedWorkDays.length > 0 ? normalizedWorkDays : null;
      let resolvedProjectId: string | null = null;
      if (projectId) {
        if (projectId.startsWith(NEW_PROJECT_PREFIX)) {
          const draftProjectName = projectId
            .slice(NEW_PROJECT_PREFIX.length)
            .trim();
          if (draftProjectName) {
            const { data: createdProject, error: projectError } = await supabase
              .from("projects")
              .insert({ name: draftProjectName.toUpperCase(), type })
              .select("id,name")
              .single();

            if (projectError) {
              setErr(projectError.message);
              setSaving(false);
              return;
            }

            const project = createdProject as Project;
            resolvedProjectId = project.id;
            setProjects((prev) => {
              const exists = prev.some((item) => item.id === project.id);
              const next = exists ? prev : [...prev, project];
              return [...next].sort((a, b) => a.name.localeCompare(b.name, "it"));
            });
          }
        } else {
          resolvedProjectId = projectId;
        }
      }

      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        type,
        status: safeWorkDays ? "OPEN" : "INBOX",
        priority: priority || "P2",
        project_id: resolvedProjectId,
        notes: notes.trim() || null,
        work_days: safeWorkDays,
      };

      if (dueDate) {
        payload.due_date = dueDate;
      }

      const { error } = await supabase.from("tasks").insert(payload);

      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }

      emitTasksUpdated();
      resetWizard();
      onCreated?.();
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Errore nel salvataggio.");
    }

    setSaving(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (step === 3) {
      void createTask();
      return;
    }
    handleNextStep();
  }

  function resetSwipeState() {
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  }

  function handleSwipeStart(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile || saving) return;
    if (document.querySelector(".date-overlay, .select-menu")) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  }

  function handleSwipeMove(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile || saving) return;
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    if (document.querySelector(".date-overlay, .select-menu")) return;
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleSwipeEnd(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile || saving) return;
    const touch = event.changedTouches[0];
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    resetSwipeState();
    if (!touch || startX === null || startY === null) return;
    if (document.querySelector(".date-overlay, .select-menu")) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (deltaX < 0 && step < 3) {
      handleNextStep();
      return;
    }
    if (deltaX > 0 && step > 1) {
      handlePrevStep();
    }
  }

  function handleSwipeCancel() {
    resetSwipeState();
  }

  if (!open) return null;

  return (
    <div
      className={`modal-overlay ${isMobile ? "wizard-overlay-mobile" : ""}`.trim()}
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
      onTouchCancel={handleSwipeCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-wizard-title"
        className={`wizard-modal wizard-modal-step-${step} ${
          isMobile ? "wizard-modal-mobile" : ""
        }`.trim()}
      >
        <div className="wizard-body">
          <div className="wizard-main">
            <div className="wizard-modal-header">
              <div className="wizard-heading">
                <h2 id="task-wizard-title" className="section-title">
                  {step === 1 && "Che task aggiungiamo?"}
                  {step === 2 && "Dammi qualche info in più"}
                  {step === 3 && "Qualcosa da aggiungere?"}
                </h2>
              </div>
            </div>

            {!isMobile ? (
              <div className="wizard-step-nav" aria-label="Navigazione wizard">
                {step > 1 ? (
                  <button
                    type="button"
                    className="week-side-arrow wizard-nav-arrow wizard-nav-arrow-left"
                    aria-label="Step precedente"
                    onClick={handlePrevStep}
                    disabled={saving}
                  >
                    <Icon name="arrow-left" size={22} />
                  </button>
                ) : (
                  <span className="wizard-nav-spacer" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="week-side-arrow wizard-nav-arrow wizard-nav-arrow-right"
                  aria-label={step === 3 ? "Conferma task" : "Step successivo"}
                  onClick={() => formRef.current?.requestSubmit()}
                  disabled={saving}
                >
                  <Icon name={step === 3 ? "check" : "arrow-right"} size={22} />
                </button>
              </div>
            ) : null}

            <form ref={formRef} onSubmit={handleSubmit} className="wizard-modal-form">
              {step === 1 ? (
                <div className="wizard-step wizard-step-intro">
                  <div className="wizard-primary-row wizard-title-row">
                    <input
                      ref={titleInputRef}
                      className={`glass-input wizard-title-input ${
                        titleInvalidFlash ? "is-invalid" : ""
                      }`.trim()}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      aria-label="Titolo task"
                    />
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="wizard-step wizard-step-details">
                  <div className="wizard-grid">
                    <div>
                      <Select
                        value={priority || ""}
                        onChange={(next) => setPriority(next as TaskPriority | "")}
                        options={PRIORITY_OPTIONS}
                        placeholder="Criticità"
                        ariaLabel="Livello di criticità"
                        showToneDot={false}
                        className={`wizard-control-select wizard-priority-field ${
                          priority ? `wizard-priority-${priority.toLowerCase()}` : ""
                        }`.trim()}
                      />
                    </div>
                    <div>
                      <Select
                        value={projectId}
                        onChange={(next) => {
                          setProjectId(next);
                          if (next.startsWith(NEW_PROJECT_PREFIX)) {
                            setPendingProjectName(next.slice(NEW_PROJECT_PREFIX.length));
                          } else {
                            setPendingProjectName("");
                          }
                        }}
                        options={projectOptions}
                        placeholder={
                          loadingProjects ? "Carico progetti..." : "Progetto"
                        }
                        ariaLabel="Progetto di riferimento"
                        disabled={loadingProjects}
                        className="wizard-control-select wizard-project-select"
                        onCreateOption={(name) => {
                          const normalized = name.trim().toUpperCase();
                          if (!normalized) return;
                          const value = `${NEW_PROJECT_PREFIX}${normalized}`;
                          setPendingProjectName(normalized);
                          setProjectId(value);
                          setErr(null);
                        }}
                        createPlaceholder="Nuovo progetto..."
                        maxVisibleOptions={3}
                      />
                    </div>

                    <div>
                      <DatePicker
                        value={dueDate}
                        onChange={(next) => setDueDate(next)}
                        wrapperClassName="wizard-control-date"
                        inputClassName="wizard-control-input"
                        placeholder="Scadenza"
                        ariaLabel="Scadenza"
                      />
                    </div>
                    <div>
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
                        wrapperClassName="wizard-control-date"
                        inputClassName="wizard-control-input"
                        placeholder="Quando ci lavori?"
                        ariaLabel="Giorni di lavoro"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="wizard-step">
                  <div>
                    <input
                      className="glass-input wizard-notes-input wizard-control-input"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Note (opzionali)"
                      aria-label="Note task"
                    />
                  </div>
                </div>
              ) : null}

              {err ? (
                <p className="wizard-inline-error">
                  {err}
                </p>
              ) : null}

              <div className="wizard-type-row">
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
                    className={`wizard-type-btn ${
                      type === "PERSONAL" ? "is-active" : ""
                    }`}
                    onClick={() => setType("PERSONAL")}
                    role="tab"
                    aria-selected={type === "PERSONAL"}
                  >
                    {TYPE_BUTTON_LABELS.PERSONAL}
                  </button>
                </div>
                {isMobile && step === 3 ? (
                  <button
                    type="submit"
                    className="wizard-mobile-submit"
                    disabled={saving}
                  >
                    {saving ? UI.SAVING : "Crea task"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="wizard-cancel-link"
                  onClick={closeAndReset}
                >
                  {UI.CANCEL}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
