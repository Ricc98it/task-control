"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import SkeletonList from "@/components/SkeletonList";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { type Project, type TaskType } from "@/lib/tasks";

type ProjectUsageRow = {
  project_id: string | null;
};

type ProjectUsage = {
  total: number;
};

function getUsageMessage(total: number): string {
  if (total <= 0) return "0 task assegnati";
  if (total === 1) return "1 task assegnato";
  return `${total} task assegnati`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [usageByProject, setUsageByProject] = useState<Record<string, ProjectUsage>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [createTypeOpen, setCreateTypeOpen] = useState(false);
  const [pendingProjectName, setPendingProjectName] = useState("");
  const [nameInvalidFlash, setNameInvalidFlash] = useState(false);
  const nameFlashTimerRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
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

    const [projectsRes, usageRes] = await Promise.all([
      supabase.from("projects").select("id,name,type").order("name"),
      supabase
        .from("tasks")
        .select("project_id")
        .not("project_id", "is", null),
    ]);

    if (projectsRes.error || usageRes.error) {
      setErr(projectsRes.error?.message ?? usageRes.error?.message ?? "Errore caricamento.");
      setLoading(false);
      return;
    }

    const nextProjects = (projectsRes.data ?? []) as Project[];
    const usageRows = (usageRes.data ?? []) as ProjectUsageRow[];
    const nextUsage: Record<string, ProjectUsage> = {};
    nextProjects.forEach((project) => {
      nextUsage[project.id] = { total: 0 };
    });
    usageRows.forEach((row) => {
      if (!row.project_id) return;
      if (!nextUsage[row.project_id]) return;
      nextUsage[row.project_id].total += 1;
    });

    setProjects(nextProjects);
    setUsageByProject(nextUsage);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (nameFlashTimerRef.current !== null) {
        window.clearTimeout(nameFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!createTypeOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateTypeOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [createTypeOpen]);

  useEffect(() => {
    if (!deleteTarget) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !deletingId) {
        setDeleteTarget(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [deleteTarget, deletingId]);

  function flashInvalidName() {
    setNameInvalidFlash(false);
    requestAnimationFrame(() => {
      setNameInvalidFlash(true);
      nameInputRef.current?.focus();
    });
    if (nameFlashTimerRef.current !== null) {
      window.clearTimeout(nameFlashTimerRef.current);
    }
    nameFlashTimerRef.current = window.setTimeout(() => {
      setNameInvalidFlash(false);
      nameFlashTimerRef.current = null;
    }, 550);
  }

  function openCreateTypeDialog(event?: React.FormEvent) {
    event?.preventDefault();
    setErr(null);
    setDeleteErr(null);

    const trimmed = name.trim().toUpperCase();
    if (!trimmed) {
      flashInvalidName();
      return;
    }

    setPendingProjectName(trimmed);
    setCreateTypeOpen(true);
  }

  async function createProject(projectType: TaskType) {
    if (!pendingProjectName || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .insert({ name: pendingProjectName, type: projectType });
    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setCreateTypeOpen(false);
    setPendingProjectName("");
    setName("");
    setLoading(true);
    await loadData();
    router.refresh();
  }

  function startRename(project: Project) {
    setErr(null);
    setDeleteErr(null);
    setDeleteTarget(null);
    setEditingId(project.id);
    setEditName(project.name.toUpperCase());
  }

  function cancelRename() {
    setEditingId(null);
    setEditName("");
  }

  async function saveRename(projectId: string) {
    setErr(null);
    setDeleteErr(null);
    const trimmed = editName.trim().toUpperCase();
    if (!trimmed) {
      setErr("Inserisci un nome progetto.");
      return;
    }
    setRenamingId(projectId);
    const { error } = await supabase
      .from("projects")
      .update({ name: trimmed })
      .eq("id", projectId);
    setRenamingId(null);

    if (error) {
      setErr(error.message);
      return;
    }

    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, name: trimmed } : project
      )
    );
    setEditingId(null);
    setEditName("");
    router.refresh();
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    setErr(null);
    setDeleteErr(null);
    const usage = usageByProject[deleteTarget.id];
    const assignedCount = usage?.total ?? 0;

    setDeletingId(deleteTarget.id);
    if (assignedCount > 0) {
      const { error: detachError } = await supabase
        .from("tasks")
        .update({ project_id: null })
        .eq("project_id", deleteTarget.id);
      if (detachError) {
        setDeletingId(null);
        setDeleteErr(detachError.message);
        return;
      }
    }

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", deleteTarget.id);
    setDeletingId(null);

    if (error) {
      setDeleteErr(error.message);
      return;
    }

    setDeleteTarget(null);
    setLoading(true);
    await loadData();
    router.refresh();
  }

  const workProjects = useMemo(
    () => projects.filter((project) => (project.type ?? "WORK") === "WORK"),
    [projects]
  );
  const personalProjects = useMemo(
    () => projects.filter((project) => project.type === "PERSONAL"),
    [projects]
  );

  const deleteAssignedCount = deleteTarget
    ? usageByProject[deleteTarget.id]?.total ?? 0
    : 0;

  function renderProjectList(bucketProjects: Project[]) {
    return bucketProjects.length === 0 ? (
      <EmptyState
        title="Nessun progetto qui"
        description="Aggiungi un progetto per popolare questa sezione."
      />
    ) : (
      <ul className="list-stack">
        {bucketProjects.map((project) => {
          const usage = usageByProject[project.id];
          const assignedCount = usage?.total ?? 0;
          const isDeleting = deletingId === project.id;
          const isEditing = editingId === project.id;

          return (
            <ListRow key={project.id} className="list-row-lg list-row-start">
              {isEditing ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    className="glass-input px-3 py-2 flex-1 min-w-[200px]"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="Nome progetto"
                    aria-label="Rinomina progetto"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => saveRename(project.id)}
                    disabled={renamingId === project.id}
                  >
                    {renamingId === project.id ? "Salvo..." : "Salva"}
                  </Button>
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={cancelRename}
                    disabled={renamingId === project.id}
                  >
                    Annulla
                  </Button>
                </div>
              ) : (
                <div className="w-full">
                  <div className="flex items-center justify-between gap-3 w-full">
                    <div className="min-w-0">
                      <p className="text-slate-100 font-medium truncate">
                        {project.name.toUpperCase()}
                      </p>
                      <p className="meta-line mt-1">
                        {getUsageMessage(assignedCount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => startRename(project)}
                        disabled={isDeleting}
                        className="project-action-btn"
                      >
                        Rinomina
                      </Button>
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          setDeleteTarget(project);
                          setDeleteErr(null);
                        }}
                        disabled={isDeleting}
                        className="project-delete-btn project-action-btn"
                      >
                        Elimina
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </ListRow>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-6 app-page">
        <div className="app-shell today-shell projects-shell max-w-5xl mx-auto px-6 pb-8 pt-3 sm:px-8 sm:pb-10 sm:pt-4">
          <form
            onSubmit={openCreateTypeDialog}
            className="projects-create-row projects-create-row-offset"
          >
            <input
              ref={nameInputRef}
              className={`glass-input wizard-title-input project-create-input ${
                nameInvalidFlash ? "is-invalid" : ""
              }`.trim()}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nuovo progetto..."
              aria-label="Nuovo progetto"
            />
            <button
              type="submit"
              className="projects-create-plus"
              aria-label="Aggiungi progetto"
              title="Aggiungi progetto"
              disabled={saving}
            >
              <Icon name="plus" size={30} />
            </button>
          </form>

          {err ? (
            <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl mt-3">
              {err}
            </p>
          ) : null}

          <div className="projects-content">
            {loading ? (
              <SkeletonList rows={4} />
            ) : (
              <div className="projects-grid">
                <div className="projects-column">
                  <div className="projects-section-header">
                    <h2 className="projects-section-title">💼 Lavoro</h2>
                    <span className="projects-section-subtitle">
                      {workProjects.length} progetti assegnati
                    </span>
                  </div>
                  <section className="today-section projects-panel">
                    {renderProjectList(workProjects)}
                  </section>
                </div>
                <div className="projects-column">
                  <div className="projects-section-header">
                    <h2 className="projects-section-title">🏡 Personale</h2>
                    <span className="projects-section-subtitle">
                      {personalProjects.length} progetti assegnati
                    </span>
                  </div>
                  <section className="today-section projects-panel">
                    {renderProjectList(personalProjects)}
                  </section>
                </div>
              </div>
            )}
            {deleteErr ? (
              <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl mt-3">
                {deleteErr}
              </p>
            ) : null}
          </div>
        </div>
      </main>

      {createTypeOpen ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Tipo progetto"
          onClick={() => setCreateTypeOpen(false)}
        >
          <div className="project-type-picker" onClick={(event) => event.stopPropagation()}>
            <p className="project-type-title">Dove lo inseriamo?</p>
            <p className="project-type-name">{pendingProjectName}</p>
            <div className="wizard-type-switch project-type-switch">
              <button
                type="button"
                className="wizard-type-btn"
                onClick={() => void createProject("WORK")}
                disabled={saving}
              >
                💼 Lavoro
              </button>
              <button
                type="button"
                className="wizard-type-btn"
                onClick={() => void createProject("PERSONAL")}
                disabled={saving}
              >
                🏡 Personale
              </button>
            </div>
            <button
              type="button"
              className="project-type-cancel"
              onClick={() => setCreateTypeOpen(false)}
              disabled={saving}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="app-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Conferma elimina progetto"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="app-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <p className="app-confirm-title">Confermi eliminazione progetto?</p>
            <p className="app-confirm-body">
              {deleteAssignedCount > 0
                ? `${deleteAssignedCount} task assegnati perderanno il progetto`
                : "Il progetto verrà eliminato definitivamente."}
            </p>
            <div className="app-confirm-actions">
              <button
                type="button"
                className="btn-tertiary px-4 py-2 text-sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
              >
                Annulla
              </button>
              <button
                type="button"
                className="btn-tertiary px-4 py-2 text-sm app-confirm-danger"
                onClick={() => void confirmDeleteProject()}
                disabled={deletingId === deleteTarget.id}
              >
                {deletingId === deleteTarget.id ? "Elimino..." : "Conferma elimina"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
