"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { onTasksUpdated } from "@/lib/taskEvents";
import {
  addDays,
  formatISODate,
  normalizeTasks,
  type Project,
  type Task,
} from "@/lib/tasks";
import type { SessionState } from "@/hooks/useSession";

export function usePlanningData(sessionState: SessionState, weekStart: Date) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingPlanning, setLoadingPlanning] = useState(true);
  const [planningErr, setPlanningErr] = useState<string | null>(null);
  const [latestDoneTaskCreatedAt, setLatestDoneTaskCreatedAt] = useState<string | null>(null);

  const yesterday = formatISODate(addDays(new Date(), -1));

  const loadPlanningData = useCallback(async () => {
    const weekStartISO = formatISODate(weekStart);
    const weekEndISO = formatISODate(addDays(weekStart, 4));
    const deadlineWindowStart = weekStartISO < yesterday ? weekStartISO : yesterday;

    const [plannedRes, deadlineRes, projectsRes, latestDoneRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
        )
        .eq("status", "OPEN")
        .overlaps(
          "work_days",
          Array.from({ length: 5 }, (_, index) =>
            formatISODate(addDays(weekStart, index))
          )
        )
        .order("work_days", { ascending: true })
        .order("priority", { ascending: true, nullsFirst: false }),
      supabase
        .from("tasks")
        .select(
          "id,title,type,due_date,work_days,status,priority,project_id,notes,project:projects(id,name)"
        )
        .not("due_date", "is", null)
        .gte("due_date", deadlineWindowStart)
        .lte("due_date", weekEndISO)
        .order("due_date", { ascending: true })
        .order("priority", { ascending: true, nullsFirst: false }),
      supabase.from("projects").select("id,name,type").order("name"),
      supabase
        .from("tasks")
        .select("created_at")
        .eq("status", "DONE")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (plannedRes.error || deadlineRes.error || projectsRes.error) {
      const message =
        plannedRes.error?.message ??
        deadlineRes.error?.message ??
        projectsRes.error?.message ??
        "Errore nel caricamento della settimana.";
      setPlanningErr(message);
    } else {
      setPlanningErr(null);
    }

    setTasks(normalizeTasks(plannedRes.data ?? []));
    setDeadlines(normalizeTasks(deadlineRes.data ?? []));
    setProjects((projectsRes.data ?? []) as Project[]);
    setLatestDoneTaskCreatedAt(
      typeof latestDoneRes.data?.[0]?.created_at === "string"
        ? latestDoneRes.data[0].created_at
        : null
    );
  }, [weekStart, yesterday]);

  useEffect(() => {
    if (sessionState !== "authed") return;
    let active = true;
    const timeoutId = window.setTimeout(() => {
      setLoadingPlanning(true);
      loadPlanningData()
        .catch((error) => {
          if (!active) return;
          setPlanningErr(
            error instanceof Error ? error.message : "Errore nel caricamento."
          );
          setTasks([]);
          setDeadlines([]);
        })
        .finally(() => {
          if (!active) return;
          setLoadingPlanning(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [loadPlanningData, sessionState]);

  useEffect(() => {
    if (sessionState !== "authed") return;
    return onTasksUpdated(() => {
      loadPlanningData().catch(() => {});
    });
  }, [loadPlanningData, sessionState]);

  return {
    tasks,
    deadlines,
    projects,
    loadingPlanning,
    planningErr,
    setPlanningErr,
    loadPlanningData,
    setTasks,
    setDeadlines,
    latestDoneTaskCreatedAt,
  };
}
