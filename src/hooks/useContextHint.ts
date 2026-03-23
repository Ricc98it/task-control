"use client";

import { useEffect, useMemo, useState } from "react";
import { getHomeContextHints } from "@/lib/contextHints";
import type { Task } from "@/lib/tasks";

interface UseContextHintParams {
  tasks: Task[];
  deadlines: Task[];
  loadingPlanning: boolean;
  lastTaskCompletedSignal: string | null;
  latestDoneTaskCreatedAt: string | null;
  today: string;
  yesterday: string;
}

function priorityRank(priority: Task["priority"]): number {
  if (priority === "P0") return 0;
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  if (priority === "P3") return 3;
  return 4;
}

export function useContextHint({
  tasks,
  deadlines,
  loadingPlanning,
  lastTaskCompletedSignal,
  latestDoneTaskCreatedAt,
  today,
  yesterday,
}: UseContextHintParams) {
  const [homeContextHint, setHomeContextHint] = useState(
    "Sto aggiornando le informazioni utili per oggi..."
  );

  const homeContextHintOptions = useMemo(() => {
    if (loadingPlanning) return [];

    const todayTasks = tasks.filter((task) => task.work_days?.includes(today)).length;
    const criticalTodayList = tasks
      .filter(
        (task) =>
          task.work_days?.includes(today) &&
          (task.priority === "P0" || task.priority === "P1")
      )
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    const criticalTodayTasks = criticalTodayList.length;
    const criticalTodayTopTaskTitle = criticalTodayList[0]?.title ?? null;
    const weekDeadlines = deadlines.filter((task) => task.status !== "DONE").length;
    const unassignedTodayTasks = tasks.filter(
      (task) => task.work_days?.includes(today) && !task.project?.name
    ).length;
    const overdueYesterdayList = deadlines.filter(
      (task) => task.status !== "DONE" && task.due_date?.slice(0, 10) === yesterday
    );
    const overdueYesterdayDeadlines = overdueYesterdayList.length;
    const overdueYesterdayTopTitle = overdueYesterdayList[0]?.title ?? null;
    const monday = new Date().getDay() === 1;

    const signalDate = lastTaskCompletedSignal ? new Date(lastTaskCompletedSignal) : null;
    const latestDoneDate = latestDoneTaskCreatedAt ? new Date(latestDoneTaskCreatedAt) : null;
    const completionReference = (() => {
      if (signalDate && latestDoneDate) {
        return signalDate > latestDoneDate ? signalDate : latestDoneDate;
      }
      return signalDate ?? latestDoneDate ?? null;
    })();
    const noCompletionForTwoDays =
      completionReference !== null &&
      Date.now() - completionReference.getTime() >= 2 * 24 * 60 * 60 * 1000;

    return getHomeContextHints({
      todayTasks,
      criticalTodayTasks,
      criticalTodayTopTaskTitle,
      weekDeadlines,
      unassignedTodayTasks,
      overdueYesterdayDeadlines,
      overdueYesterdayTopTitle,
      isMonday: monday,
      noCompletionForTwoDays,
    });
  }, [
    deadlines,
    lastTaskCompletedSignal,
    latestDoneTaskCreatedAt,
    loadingPlanning,
    tasks,
    today,
    yesterday,
  ]);

  useEffect(() => {
    if (loadingPlanning) {
      setHomeContextHint("Sto aggiornando le informazioni utili per oggi...");
      return;
    }

    if (homeContextHintOptions.length === 0) {
      setHomeContextHint("Settimana leggera: nessun task pianificato per oggi");
      return;
    }

    setHomeContextHint((previous) => {
      if (homeContextHintOptions.length === 1) return homeContextHintOptions[0]!;
      const pool = previous
        ? homeContextHintOptions.filter((hint) => hint !== previous)
        : homeContextHintOptions;
      const source = pool.length > 0 ? pool : homeContextHintOptions;
      const randomIndex = Math.floor(Math.random() * source.length);
      return source[randomIndex]!;
    });
  }, [homeContextHintOptions, loadingPlanning]);

  return { homeContextHint };
}
