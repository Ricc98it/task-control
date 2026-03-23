"use client";

import { useMemo, useState } from "react";
import { addDays, formatISODate, startOfWeek } from "@/lib/tasks";

export type DropTarget = { id: string; label: string; date: string };

const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven"] as const;

export function useWeekNavigation() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [activeDayIndex, setActiveDayIndex] = useState(() => {
    const day = new Date().getDay();
    if (day === 0 || day === 6) return 4;
    return Math.min(4, Math.max(0, day - 1));
  });

  const days = useMemo<DropTarget[]>(() => {
    return DAY_LABELS.map((label, index) => {
      const date = addDays(weekStart, index);
      return { id: formatISODate(date), label, date: formatISODate(date) };
    });
  }, [weekStart]);

  const previousDay = useMemo<DropTarget>(() => {
    let index = activeDayIndex - 1;
    let baseWeekStart = weekStart;
    if (index < 0) {
      index = 4;
      baseWeekStart = addDays(weekStart, -7);
    }
    const date = formatISODate(addDays(baseWeekStart, index));
    return { id: `prev-${date}`, label: DAY_LABELS[index] ?? "Lun", date };
  }, [activeDayIndex, weekStart]);

  const nextDay = useMemo<DropTarget>(() => {
    let index = activeDayIndex + 1;
    let baseWeekStart = weekStart;
    if (index > 4) {
      index = 0;
      baseWeekStart = addDays(weekStart, 7);
    }
    const date = formatISODate(addDays(baseWeekStart, index));
    return { id: `next-${date}`, label: DAY_LABELS[index] ?? "Lun", date };
  }, [activeDayIndex, weekStart]);

  const activeDay = days[activeDayIndex] ?? days[0] ?? null;

  function goPrevDay() {
    setActiveDayIndex((prev) => {
      if (prev > 0) return prev - 1;
      setWeekStart((current) => addDays(current, -7));
      return 4;
    });
  }

  function goNextDay() {
    setActiveDayIndex((prev) => {
      if (prev < 4) return prev + 1;
      setWeekStart((current) => addDays(current, 7));
      return 0;
    });
  }

  function goToToday() {
    const now = new Date();
    const weekday = now.getDay();
    const nextIndex =
      weekday === 0 || weekday === 6 ? 4 : Math.min(4, Math.max(0, weekday - 1));
    setWeekStart(startOfWeek(now));
    setActiveDayIndex(nextIndex);
  }

  return {
    weekStart,
    setWeekStart,
    activeDayIndex,
    days,
    previousDay,
    nextDay,
    activeDay,
    goPrevDay,
    goNextDay,
    goToToday,
  };
}
