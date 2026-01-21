export const TASKS_UPDATED_EVENT = "tasks:updated";

export function emitTasksUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TASKS_UPDATED_EVENT));
}

export function onTasksUpdated(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TASKS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(TASKS_UPDATED_EVENT, handler);
}
