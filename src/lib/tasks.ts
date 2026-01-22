export type TaskStatus = "INBOX" | "OPEN" | "DONE";
export type TaskType = "WORK" | "PERSONAL";
export type TaskPriority = "P0" | "P1" | "P2" | "P3";
export type PriorityTone = "p0" | "p1" | "p2" | "p3";
export type TypeTone = "work" | "personal";
export type StatusTone = "inbox" | "open" | "done";

export type Project = {
  id: string;
  name: string;
  color?: string | null;
};

export type Task = {
  id: string;
  title: string;
  type: TaskType;
  due_date: string | null;
  work_days: string[] | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  project_id: string | null;
  notes: string | null;
  project?: Project | null;
};

export type TaskRow = Omit<Task, "project" | "work_days"> & {
  project?: Project | Project[] | null;
  work_days?: string[] | null;
  work_day?: string | null;
};

const PRIORITY_META: Record<
  TaskPriority,
  { label: string; emoji: string; tone: PriorityTone }
> = {
  P0: { label: "Critico", emoji: "🔥", tone: "p0" },
  P1: { label: "Alto", emoji: "⚡", tone: "p1" },
  P2: { label: "Medio", emoji: "✨", tone: "p2" },
  P3: { label: "Basso", emoji: "🌿", tone: "p3" },
};

const TYPE_META: Record<TaskType, { label: string; emoji: string; tone: TypeTone }> =
  {
    WORK: { label: "Lavoro", emoji: "💼", tone: "work" },
    PERSONAL: { label: "Personale", emoji: "🏡", tone: "personal" },
  };

const STATUS_META: Record<
  TaskStatus,
  { label: string; emoji: string; tone: StatusTone }
> = {
  INBOX: { label: "Da pianificare", emoji: "📥", tone: "inbox" },
  OPEN: { label: "Pianificato", emoji: "🗓️", tone: "open" },
  DONE: { label: "Completato", emoji: "✅", tone: "done" },
};

export const PRIORITY_OPTIONS = [
  { value: "P0", label: "🔥 Critico", tone: "p0" },
  { value: "P1", label: "⚡ Alto", tone: "p1" },
  { value: "P2", label: "✨ Medio", tone: "p2" },
  { value: "P3", label: "🌿 Basso", tone: "p3" },
];

export const TYPE_OPTIONS = [
  { value: "WORK", label: "💼 Lavoro", tone: "work" },
  { value: "PERSONAL", label: "🏡 Personale", tone: "personal" },
];

export const STATUS_OPTIONS = [
  { value: "OPEN", label: "🗓️ Pianificato", tone: "open" },
  { value: "INBOX", label: "📥 Da pianificare", tone: "inbox" },
  { value: "DONE", label: "✅ Completato", tone: "done" },
];

export function getPriorityMeta(priority?: TaskPriority | null) {
  return PRIORITY_META[priority ?? "P2"];
}

export function getTypeMeta(type: TaskType) {
  return TYPE_META[type];
}

export function getStatusMeta(status: TaskStatus) {
  return STATUS_META[status];
}

export function formatPriorityLabel(priority?: TaskPriority | null): string {
  const meta = getPriorityMeta(priority);
  return `${meta.emoji} ${meta.label}`;
}

export function formatTypeLabel(type: TaskType): string {
  const meta = getTypeMeta(type);
  return `${meta.emoji} ${meta.label}`;
}

export function formatStatusLabel(
  status: TaskStatus,
  hasWorkDays: boolean = true
): string {
  if (status === "OPEN" && !hasWorkDays) {
    return "🕒 Da pianificare";
  }
  const meta = getStatusMeta(status);
  return `${meta.emoji} ${meta.label}`;
}

function formatDayWithMonth(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
    date
  );
  return { day, month };
}

export function formatWorkDaysSummary(days: string[]): string {
  if (!days || days.length === 0) return "";
  const normalized = Array.from(new Set(days)).sort();
  const parsed = normalized
    .map((value) => parseISODate(value))
    .filter((value): value is Date => Boolean(value));
  if (parsed.length === 0) return "";
  parsed.sort((a, b) => a.getTime() - b.getTime());

  const isConsecutive = parsed.every((date, index) => {
    if (index === 0) return true;
    const prev = parsed[index - 1];
    const diff = date.getTime() - prev.getTime();
    return diff === 24 * 60 * 60 * 1000;
  });

  if (isConsecutive && parsed.length > 1) {
    const start = parsed[0];
    const end = parsed[parsed.length - 1];
    if (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth()
    ) {
      const startLabel = formatDayWithMonth(start);
      const endLabel = formatDayWithMonth(end);
      return `${startLabel.day}-${endLabel.day} ${endLabel.month}`;
    }
    return `${formatDisplayDate(formatISODate(start))} - ${formatDisplayDate(
      formatISODate(end)
    )}`;
  }

  if (parsed.length <= 2) {
    return parsed
      .map((date) => formatDisplayDate(formatISODate(date)))
      .join(", ");
  }

  const firstTwo = parsed
    .slice(0, 2)
    .map((date) => formatDisplayDate(formatISODate(date)))
    .join(", ");
  return `${firstTwo} +${parsed.length - 2}`;
}

export function normalizeTask(task: TaskRow): Task {
  const project = Array.isArray(task.project)
    ? task.project[0] ?? null
    : task.project ?? null;
  const fallbackWorkDays = task.work_day ? [task.work_day] : null;
  const rawWorkDays =
    task.work_days && task.work_days.length > 0
      ? task.work_days
      : fallbackWorkDays;
  const work_days =
    rawWorkDays && rawWorkDays.length > 0
      ? Array.from(new Set(rawWorkDays)).sort()
      : null;
  return { ...task, project, work_days };
}

export function normalizeTasks(tasks: TaskRow[]): Task[] {
  return tasks.map(normalizeTask);
}

export function parseISODate(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDisplayDate(
  value: string,
  options?: { withYear?: boolean; withWeekday?: boolean }
): string {
  const date = parseISODate(value);
  if (!date) return value;
  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  };
  if (options?.withYear) formatOptions.year = "numeric";
  if (options?.withWeekday) formatOptions.weekday = "short";
  return new Intl.DateTimeFormat("it-IT", formatOptions).format(date);
}

export function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" | ");
}

export function formatISODate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayISO(): string {
  return formatISODate(new Date());
}

export function startOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
