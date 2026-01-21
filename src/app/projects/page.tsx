"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { type Project } from "@/lib/tasks";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
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

      const { data, error } = await supabase
        .from("projects")
        .select("id,name")
        .order("name");

      if (!error) setProjects((data ?? []) as Project[]);
      setLoading(false);
    }

    run();
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setDeleteErr(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Inserisci un nome progetto.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("projects").insert({ name: trimmed });
    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setName("");
    const { data } = await supabase
      .from("projects")
      .select("id,name")
      .order("name");
    setProjects((data ?? []) as Project[]);
    router.refresh();
  }

  async function deleteProject(project: Project) {
    setErr(null);
    setDeleteErr(null);
    if (!confirm(`Eliminare il progetto "${project.name}"?`)) return;
    setDeletingId(project.id);
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);
    setDeletingId(null);

    if (error) {
      setDeleteErr(error.message);
      return;
    }

    setProjects((prev) => prev.filter((item) => item.id !== project.id));
    router.refresh();
  }

  function startRename(project: Project) {
    setErr(null);
    setDeleteErr(null);
    setEditingId(project.id);
    setEditName(project.name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditName("");
  }

  async function saveRename(projectId: string) {
    setErr(null);
    setDeleteErr(null);
    const trimmed = editName.trim();
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

  const total = useMemo(() => projects.length, [projects]);

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="🗂️ Progetti"
            subtitle={loading ? "Caricamento..." : `${total} progetti attivi`}
          />

          <form onSubmit={createProject} className="mt-6 glass-panel p-5">
            <SectionHeader title="✨ Nuovo progetto" subtitle="Crea un contenitore" />
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="glass-input px-4 py-2 flex-1 min-w-[220px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome progetto"
                required
              />
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={saving}
                icon={<Icon name="plus" />}
              >
                {saving ? "Salvo..." : "Aggiungi"}
              </Button>
            </div>
            {err && (
              <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl mt-3">
                {err}
              </p>
            )}
          </form>

          <div className="mt-6">
            {loading ? (
              <SkeletonList rows={4} />
            ) : projects.length === 0 ? (
              <EmptyState
                title="Nessun progetto ancora"
                description="Creane uno per iniziare."
              />
            ) : (
              <ul className="list-stack">
                {projects.map((project) => (
                  <ListRow key={project.id} className="list-row-lg">
                    {editingId === project.id ? (
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
                      <div className="flex items-center justify-between gap-3 w-full">
                        <p className="text-slate-100 font-medium">
                          {project.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="tertiary"
                            size="sm"
                            onClick={() => startRename(project)}
                            disabled={deletingId === project.id}
                          >
                            ✏️ Rinomina
                          </Button>
                          <Button
                            variant="tertiary"
                            size="sm"
                            onClick={() => deleteProject(project)}
                            disabled={deletingId === project.id}
                          >
                            {deletingId === project.id
                              ? "Elimino..."
                              : "🗑️ Elimina"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </ListRow>
                ))}
              </ul>
            )}
            {deleteErr && (
              <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl mt-3">
                {deleteErr}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
