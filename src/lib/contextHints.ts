import type { TaskType } from "@/lib/tasks";

type HomeContextStats = {
  todayTasks: number;
  criticalTodayTasks: number;
  weekDeadlines: number;
  unassignedTodayTasks: number;
};

type TasksContextStats = {
  visibleTasks: number;
  criticalTasks: number;
  inboxTasks: number;
  unassignedTasks: number;
  activeType: TaskType;
  planFilter: "ALL" | "OPEN" | "INBOX";
};

type ProjectsContextStats = {
  workProjects: number;
  personalProjects: number;
  unassignedWorkTasks: number;
  unassignedPersonalTasks: number;
};

function formatCount(count: number, singular: string, plural?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural ?? singular}`;
}

export function getHomeContextHint(stats: HomeContextStats): string {
  return getHomeContextHints(stats)[0];
}

export function getHomeContextHints(stats: HomeContextStats): string[] {
  const hints: string[] = [];

  if (stats.criticalTodayTasks > 0) {
    hints.push(
      `Oggi hai ${formatCount(stats.criticalTodayTasks, "task critico", "task critici")} da gestire`
    );
  }
  if (stats.todayTasks > 0) {
    hints.push(`Oggi hai ${formatCount(stats.todayTasks, "task")} da completare`);
  }
  if (stats.weekDeadlines > 0) {
    hints.push(
      `Hai ${formatCount(stats.weekDeadlines, "scadenza", "scadenze")} in questa settimana`
    );
  }
  if (stats.unassignedTodayTasks > 0) {
    hints.push(`${formatCount(stats.unassignedTodayTasks, "task")} di oggi senza progetto`);
  }

  if (hints.length === 0) {
    hints.push("Settimana leggera: nessun task pianificato per oggi");
  }

  return hints;
}

export function getTasksContextHint(stats: TasksContextStats): string {
  const areaLabel = stats.activeType === "WORK" ? "lavoro" : "personali";

  if (stats.visibleTasks === 0) {
    if (stats.planFilter === "OPEN") {
      return `Nessun task ${areaLabel} pianificato con i filtri attivi`;
    }
    if (stats.planFilter === "INBOX") {
      return `Nessun task ${areaLabel} da pianificare con i filtri attivi`;
    }
    return `Nessun task ${areaLabel} con i filtri attivi`;
  }

  if (stats.criticalTasks > 0) {
    return `${formatCount(stats.criticalTasks, "task")} ${areaLabel} ad alta criticità`;
  }
  if (stats.unassignedTasks > 0) {
    return `${formatCount(stats.unassignedTasks, "task")} ${areaLabel} senza progetto`;
  }
  if (stats.inboxTasks > 0) {
    return `${formatCount(stats.inboxTasks, "task")} ${areaLabel} da pianificare`;
  }
  return `${formatCount(stats.visibleTasks, "task")} ${areaLabel} in vista`;
}

export function getProjectsContextHint(stats: ProjectsContextStats): string {
  const totalProjects = stats.workProjects + stats.personalProjects;
  const totalUnassigned = stats.unassignedWorkTasks + stats.unassignedPersonalTasks;

  if (totalUnassigned > 0) {
    if (stats.unassignedWorkTasks > 0 && stats.unassignedPersonalTasks > 0) {
      return `${formatCount(totalUnassigned, "task")} senza progetto da assegnare`;
    }
    if (stats.unassignedWorkTasks > 0) {
      return `${formatCount(stats.unassignedWorkTasks, "task")} lavoro senza progetto`;
    }
    return `${formatCount(stats.unassignedPersonalTasks, "task")} personali senza progetto`;
  }

  if (totalProjects === 0) {
    return "Inizia creando un progetto lavoro o personale";
  }
  if (stats.workProjects === 0) {
    return "Hai solo progetti personali: aggiungi il primo progetto lavoro";
  }
  if (stats.personalProjects === 0) {
    return "Hai solo progetti lavoro: aggiungi il primo progetto personale";
  }
  return `${formatCount(totalProjects, "progetto", "progetti")} attivi ben distribuiti`;
}
