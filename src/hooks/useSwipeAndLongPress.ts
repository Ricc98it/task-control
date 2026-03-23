"use client";

import { useEffect, useRef } from "react";
import type { TouchEvent } from "react";
import type { Task } from "@/lib/tasks";

interface UseSwipeAndLongPressParams {
  isMobile: boolean;
  goPrevDay: () => void;
  goNextDay: () => void;
  setMovingTaskTarget: (task: Task) => void;
  setMovingDeadlineTarget: (task: Task) => void;
  setTaskActionTarget: (task: Task) => void;
}

export function useSwipeAndLongPress({
  isMobile,
  goPrevDay,
  goNextDay,
  setMovingTaskTarget,
  setMovingDeadlineTarget,
  setTaskActionTarget,
}: UseSwipeAndLongPressParams) {
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const taskLongPressTimerRef = useRef<number | null>(null);
  const deadlineLongPressTimerRef = useRef<number | null>(null);
  const consumeTaskClickRef = useRef<string | null>(null);
  const consumeDeadlineClickRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (taskLongPressTimerRef.current !== null) {
        window.clearTimeout(taskLongPressTimerRef.current);
      }
      if (deadlineLongPressTimerRef.current !== null) {
        window.clearTimeout(deadlineLongPressTimerRef.current);
      }
    };
  }, []);

  function handleDayTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartXRef.current = touch.clientX;
    swipeStartYRef.current = touch.clientY;
  }

  function handleDayTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile) return;
    const touch = event.changedTouches[0];
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    if (!touch || startX === null || startY === null) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 46 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (deltaX < 0) {
      goNextDay();
      return;
    }
    goPrevDay();
  }

  function cancelTaskLongPress() {
    if (taskLongPressTimerRef.current !== null) {
      window.clearTimeout(taskLongPressTimerRef.current);
      taskLongPressTimerRef.current = null;
    }
  }

  function cancelDeadlineLongPress() {
    if (deadlineLongPressTimerRef.current !== null) {
      window.clearTimeout(deadlineLongPressTimerRef.current);
      deadlineLongPressTimerRef.current = null;
    }
  }

  function startTaskLongPress(task: Task) {
    cancelTaskLongPress();
    taskLongPressTimerRef.current = window.setTimeout(() => {
      consumeTaskClickRef.current = task.id;
      setMovingTaskTarget(task);
      taskLongPressTimerRef.current = null;
    }, 420);
  }

  function startDeadlineLongPress(task: Task) {
    cancelDeadlineLongPress();
    deadlineLongPressTimerRef.current = window.setTimeout(() => {
      consumeDeadlineClickRef.current = task.id;
      setMovingDeadlineTarget(task);
      deadlineLongPressTimerRef.current = null;
    }, 420);
  }

  function handleTaskTap(task: Task) {
    if (consumeTaskClickRef.current === task.id) {
      consumeTaskClickRef.current = null;
      return;
    }
    setTaskActionTarget(task);
  }

  function handleDeadlineTap(task: Task) {
    if (consumeDeadlineClickRef.current === task.id) {
      consumeDeadlineClickRef.current = null;
      return;
    }
    setTaskActionTarget(task);
  }

  return {
    handleDayTouchStart,
    handleDayTouchEnd,
    cancelTaskLongPress,
    cancelDeadlineLongPress,
    startTaskLongPress,
    startDeadlineLongPress,
    handleTaskTap,
    handleDeadlineTap,
  };
}
