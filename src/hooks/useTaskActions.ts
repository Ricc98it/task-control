"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "@/lib/supabaseClient";
import { emitTasksUpdated } from "@/lib/taskEvents";
import { markTaskCompletedNow } from "@/lib/taskCompletion";
import type { Task } from "@/lib/tasks";

interface UseTaskActionsParams {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setDeadlines: Dispatch<SetStateAction<Task[]>>;
  setPlanningErr: Dispatch<SetStateAction<string | null>>;
  loadPlanningData: () => Promise<void>;
  showTaskCompletedOverlay: () => void;
  onCompleted?: () => void;
}

export function useTaskActions({
  tasks,
  setTasks,
  setDeadlines,
  setPlanningErr,
  loadPlanningData,
  showTaskCompletedOverlay,
  onCompleted,
}: UseTaskActionsParams) {
  const [completingId, setCompletingId] = useState<string | null>(null);

  async function moveTask(taskId: string, targetDate: string | null) {
    setPlanningErr(null);
    const currentTask = tasks.find((task) => task.id === taskId);
    const nextDays =
      targetDate === null
        ? null
        : Array.from(new Set([...(currentTask?.work_days ?? []), targetDate])).sort();

    const payload: Pick<Task, "status" | "work_days"> =
      targetDate === null
        ? { status: "INBOX", work_days: null }
        : { status: "OPEN", work_days: nextDays };

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
    }
  }

  async function moveDeadline(taskId: string, targetDate: string) {
    setPlanningErr(null);
    const payload: Pick<Task, "due_date"> = { due_date: targetDate };

    setDeadlines((prev) => {
      const hasItem = prev.some((task) => task.id === taskId);
      if (hasItem) {
        return prev.map((task) =>
          task.id === taskId ? { ...task, due_date: targetDate } : task
        );
      }
      const source = tasks.find((task) => task.id === taskId);
      if (!source) return prev;
      return [...prev, { ...source, due_date: targetDate }];
    });

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: targetDate } : task
      )
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
    }
  }

  async function updateTaskWorkingDays(taskId: string, nextDays: string[]) {
    setPlanningErr(null);
    const normalizedDays = Array.from(new Set(nextDays)).sort();
    const payload: Pick<Task, "status" | "work_days"> = {
      status: normalizedDays.length > 0 ? "OPEN" : "INBOX",
      work_days: normalizedDays.length > 0 ? normalizedDays : null,
    };

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
      return;
    }

    await loadPlanningData().catch(() => {});
  }

  async function removeDayFromTask(taskId: string, day: string) {
    setPlanningErr(null);
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask?.work_days) return;

    const nextDays = currentTask.work_days.filter((value) => value !== day);
    const payload: Pick<Task, "status" | "work_days"> = {
      status: currentTask.status,
      work_days: nextDays.length > 0 ? nextDays : null,
    };

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task))
    );

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (error) {
      setPlanningErr(error.message);
      await loadPlanningData().catch(() => {});
    }
  }

  async function completeTaskFromWeek(task: Task) {
    if (completingId) return;
    setPlanningErr(null);
    setCompletingId(task.id);

    const payload: Pick<Task, "status" | "work_days"> = {
      status: "DONE",
      work_days: null,
    };

    const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
    setCompletingId(null);

    if (error) {
      setPlanningErr(error.message);
      return;
    }

    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    setDeadlines((prev) =>
      prev.map((item) =>
        item.id === task.id ? { ...item, status: "DONE", work_days: null } : item
      )
    );

    markTaskCompletedNow();
    emitTasksUpdated();
    showTaskCompletedOverlay();
    onCompleted?.();
  }

  return {
    completingId,
    moveTask,
    moveDeadline,
    updateTaskWorkingDays,
    removeDayFromTask,
    completeTaskFromWeek,
  };
}
