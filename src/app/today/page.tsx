"use client";

import Nav from "@/components/Nav";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { emitTasksUpdated } from "@/lib/taskEvents";
import {
  formatDisplayDate,
  getPriorityMeta,
  joinMeta,
  type TaskPriority,
} from "@/lib/tasks";

type Task = {
  id: string;
  title: string;
  type: "WORK" | "PERSONAL";
  due_date: string | null;
  work_days: string[] | null;
  status: "OPEN" | "DONE";
  priority: TaskPriority | null;
  project: { id: string; name: string } | null;
};

function todayISO(): string {
  // YYYY-MM-DD in locale
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const today = useMemo(() => todayISO(), []);

  useEffect(() => {
    async function run() {
      try {
        const session = await ensureSession();
        if (!session) {
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project:projects(id,name)"
        )
        .eq("status", "OPEN")
        .contains("work_days", [today])
        .order("type", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false });

      if (error) {
        console.error(error);
      } else {
        setTasks((data ?? []) as Task[]);
      }
      setLoading(false);
    }

    run();
  }, [today]);

  const work = tasks.filter((t) => t.type === "WORK");
  const personal = tasks.filter((t) => t.type === "PERSONAL");

  async function completeTask(task: Task) {
    if (markingId) return;
    setErr(null);
    setMarkingId(task.id);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setMarkingId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    emitTasksUpdated();
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10 app-page">
        <div className="app-shell today-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Oggi"
            subtitle={formatDisplayDate(today, { withWeekday: true })}
          />

          {loading ? (
            <SkeletonList rows={4} />
          ) : (
            <div className="today-content">
              {err && (
                <p className="text-sm text-red-200 border border-red-500/30 bg-red-500/10 px-3 py-2 rounded-xl">
                  {err}
                </p>
              )}
              <div className="today-grid">
                <Section
                  title="💼 Lavoro"
                  items={work}
                  today={today}
                  onComplete={completeTask}
                  markingId={markingId}
                />
                <Section
                  title="🏡 Personale"
                  items={personal}
                  today={today}
                  onComplete={completeTask}
                  markingId={markingId}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  items,
  today,
  onComplete,
  markingId,
}: {
  title: string;
  items: Task[];
  today: string;
  onComplete: (task: Task) => void;
  markingId: string | null;
}) {
  return (
    <section className="glass-panel p-5 today-section">
      <SectionHeader title={title} subtitle={`${items.length} task`} />
      {items.length === 0 ? (
        <p className="meta-line mt-2">Nessun task qui.</p>
      ) : (
        <ul className="mt-3 list-stack">
          {items.map((t) => {
            const priorityMeta = getPriorityMeta(t.priority);
            const dueText = t.due_date
              ? `Scadenza: ${formatDisplayDate(t.due_date)}`
              : null;
            const projectText = t.project?.name ?? null;
            const meta = joinMeta([projectText, dueText]);
            const isDueToday = t.due_date === today;
            return (
              <ListRow
                key={t.id}
                className={`list-row-lg priority-card-${priorityMeta.tone}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-100">{t.title}</p>
                  {meta && (
                    <p className="meta-line mt-1">
                      {projectText ? (
                        <span>{projectText}</span>
                      ) : null}
                      {projectText && dueText ? " | " : ""}
                      {dueText ? (
                        <span
                          className={isDueToday ? "meta-line-alert" : undefined}
                        >
                          {dueText}
                        </span>
                      ) : null}
                    </p>
                  )}
                </div>
                <Button
                  variant="tertiary"
                  size="sm"
                  icon={<Icon name="check" size={16} />}
                  onClick={() => onComplete(t)}
                  disabled={markingId === t.id}
                  className="stretched-guard"
                >
                  {markingId === t.id ? "Completo..." : "Completa"}
                </Button>
              </ListRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}
