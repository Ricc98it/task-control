const TASK_COMPLETION_STORAGE_KEY = "task-control:last-task-completed-at";
const TASK_COMPLETION_EVENT = "tasks:completed";

function asValidIsoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function getLastTaskCompletedAt(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TASK_COMPLETION_STORAGE_KEY);
  return asValidIsoDate(raw);
}

export function markTaskCompletedNow() {
  if (typeof window === "undefined") return;
  const nowIso = new Date().toISOString();
  window.localStorage.setItem(TASK_COMPLETION_STORAGE_KEY, nowIso);
  window.dispatchEvent(new CustomEvent<string>(TASK_COMPLETION_EVENT, { detail: nowIso }));
}

export function onTaskCompleted(handler: (completedAtIso: string) => void) {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<string>;
    const safeValue = asValidIsoDate(customEvent.detail ?? null);
    if (!safeValue) return;
    handler(safeValue);
  };

  window.addEventListener(TASK_COMPLETION_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(TASK_COMPLETION_EVENT, listener as EventListener);
  };
}
