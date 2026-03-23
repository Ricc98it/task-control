"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";

export const DRAG_TYPE_TASK = "application/x-task-control-task";
export const DRAG_TYPE_DEADLINE = "application/x-task-control-deadline";
export const DEADLINE_PREFIX = "deadline:";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDraggedTaskId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const stripped = value.startsWith(DEADLINE_PREFIX)
    ? value.slice(DEADLINE_PREFIX.length)
    : value;
  if (UUID_REGEX.test(stripped)) return stripped;

  const match = /\/task\/([0-9a-f-]{36})(?:$|[/?#])/i.exec(value);
  if (!match?.[1]) return null;
  return UUID_REGEX.test(match[1]) ? match[1] : null;
}

interface UseDragDropParams {
  moveTask: (taskId: string, targetDate: string | null) => Promise<void>;
  moveDeadline: (taskId: string, targetDate: string) => Promise<void>;
}

export function useDragDrop({ moveTask, moveDeadline }: UseDragDropParams) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const dropHandledRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const draggingFromRef = useRef<string | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, targetDate: string | null) {
    event.preventDefault();
    const deadlineData = event.dataTransfer.getData(DRAG_TYPE_DEADLINE);
    const taskData = event.dataTransfer.getData(DRAG_TYPE_TASK);
    const plainData = event.dataTransfer.getData("text/plain");
    const inferDeadlineFromUrl =
      !taskData &&
      !draggingId &&
      !draggingIdRef.current &&
      /^https?:\/\/.+\/task\/[0-9a-f-]{36}(?:$|[/?#])/i.test(plainData);

    const deadlineId =
      parseDraggedTaskId(deadlineData) ??
      parseDraggedTaskId(
        plainData.startsWith(DEADLINE_PREFIX) ? plainData : null
      ) ??
      (inferDeadlineFromUrl ? parseDraggedTaskId(plainData) : null);

    if (deadlineId && targetDate) {
      dropHandledRef.current = true;
      void moveDeadline(deadlineId, targetDate);
      setDraggingId(null);
      draggingIdRef.current = null;
      setDraggingFrom(null);
      draggingFromRef.current = null;
      setHoverTarget(null);
      return;
    }

    const taskId = parseDraggedTaskId(
      draggingId ?? draggingIdRef.current ?? taskData ?? plainData
    );
    if (!taskId) return;

    dropHandledRef.current = true;
    void moveTask(taskId, targetDate);
    setDraggingId(null);
    draggingIdRef.current = null;
    setDraggingFrom(null);
    draggingFromRef.current = null;
    setHoverTarget(null);
  }

  return {
    draggingId,
    setDraggingId,
    draggingFrom,
    setDraggingFrom,
    hoverTarget,
    setHoverTarget,
    dropHandledRef,
    draggingIdRef,
    draggingFromRef,
    handleDrop,
  };
}
