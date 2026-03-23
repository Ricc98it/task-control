"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLastTaskCompletedAt, onTaskCompleted } from "@/lib/taskCompletion";

export function useCompletionOverlay() {
  const [taskCompletedOverlayVisible, setTaskCompletedOverlayVisible] = useState(false);
  const [lastTaskCompletedSignal, setLastTaskCompletedSignal] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setLastTaskCompletedSignal(getLastTaskCompletedAt());
    return onTaskCompleted((completedAtIso) => {
      setLastTaskCompletedSignal(completedAtIso);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showTaskCompletedOverlay = useCallback(() => {
    setTaskCompletedOverlayVisible(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setTaskCompletedOverlayVisible(false);
      timerRef.current = null;
    }, 1500);
  }, []);

  return {
    taskCompletedOverlayVisible,
    showTaskCompletedOverlay,
    lastTaskCompletedSignal,
  };
}
