"use client";

import { useMemo } from "react";
import { getHomeContextHints } from "@/lib/contextHints";
import { addDays, formatISODate, parseISODate, type Task } from "@/lib/tasks";

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
    const todayDate = parseISODate(today);
    const monday = todayDate ? todayDate.getDay() === 1 : false;
    const twoDaysAgoIso = todayDate ? formatISODate(addDays(todayDate, -2)) : null;

    const signalDate = lastTaskCompletedSignal ? new Date(lastTaskCompletedSignal) : null;
    const safeSignalDate =
      signalDate && !Number.isNaN(signalDate.getTime()) ? signalDate : null;
    const latestDoneDate = latestDoneTaskCreatedAt ? new Date(latestDoneTaskCreatedAt) : null;
    const safeLatestDoneDate =
      latestDoneDate && !Number.isNaN(latestDoneDate.getTime()) ? latestDoneDate : null;
    const completionReference = (() => {
      if (safeSignalDate && safeLatestDoneDate) {
        return safeSignalDate > safeLatestDoneDate ? safeSignalDate : safeLatestDoneDate;
      }
      return safeSignalDate ?? safeLatestDoneDate ?? null;
    })();
    const completionReferenceIsoDay = completionReference
      ? completionReference.toISOString().slice(0, 10)
      : null;
    const noCompletionForTwoDays =
      Boolean(
        twoDaysAgoIso &&
          completionReferenceIsoDay &&
          completionReferenceIsoDay <= twoDaysAgoIso
      );

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

  const homeContextHint = useMemo(() => {
    if (loadingPlanning) {
      return "Sto aggiornando le informazioni utili per oggi...";
    }
    if (homeContextHintOptions.length === 0) {
      return "Settimana leggera: nessun task pianificato per oggi";
    }
    return homeContextHintOptions[0]!;
  }, [homeContextHintOptions, loadingPlanning]);

  return { homeContextHint };
}
