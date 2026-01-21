"use client";

import Nav from "@/components/Nav";
import ListRow from "@/components/ListRow";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import SkeletonList from "@/components/SkeletonList";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureSession } from "@/lib/autoSession";
import { formatDisplayDate, getPriorityMeta, type TaskPriority } from "@/lib/tasks";

type Task = {
  id: string;
  title: string;
  type: "WORK" | "PERSONAL";
  due_date: string | null;
  work_days: string[] | null;
  status: "OPEN" | "DONE";
  priority: TaskPriority | null;
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
        .select("id,title,type,due_date,work_days,status,priority")
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

  return (
    <>
      <Nav />
      <main className="min-h-screen px-6 py-10">
        <div className="app-shell max-w-5xl mx-auto p-6 sm:p-8">
          <PageHeader
            title="Oggi"
            subtitle={formatDisplayDate(today, { withWeekday: true })}
          />

          {loading ? (
            <SkeletonList rows={4} />
          ) : (
            <div className="mt-6 space-y-8">
              <Section title="💼 Lavoro" items={work} />
              <Section title="🏡 Personale" items={personal} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Section({ title, items }: { title: string; items: Task[] }) {
  return (
    <section>
      <SectionHeader title={title} subtitle={`${items.length} task`} />
      {items.length === 0 ? (
        <p className="meta-line mt-2">Nessun task qui.</p>
      ) : (
        <ul className="mt-3 list-stack">
          {items.map((t) => {
            const priorityMeta = getPriorityMeta(t.priority);
            return (
              <ListRow key={t.id} className="list-row-lg">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-100">{t.title}</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge-pill priority-pill priority-${priorityMeta.tone} px-2 py-1`}
                    >
                      {priorityMeta.emoji} {priorityMeta.label}
                    </span>
                    {t.due_date && (
                      <span className="meta-line">
                        Scadenza: {formatDisplayDate(t.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </ListRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}
