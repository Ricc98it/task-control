/**
 * Single source of truth for all UI strings.
 * Domain labels, recurring actions, and error messages.
 * No i18n library — just a flat file.
 */

// ---------------------------------------------------------------------------
// Priority labels
// ---------------------------------------------------------------------------
export const PRIORITY_LABELS = {
  P0: "Critico",
  P1: "Alto",
  P2: "Medio",
  P3: "Basso",
} as const;

export const PRIORITY_EMOJIS = {
  P0: "🔴",
  P1: "🟠",
  P2: "🔵",
  P3: "🟢",
} as const;

// ---------------------------------------------------------------------------
// Task type labels
// ---------------------------------------------------------------------------
export const TYPE_LABELS = {
  WORK: "Lavoro",
  PERSONAL: "Personale",
} as const;

export const TYPE_EMOJIS = {
  WORK: "💼",
  PERSONAL: "🏡",
} as const;

export const TYPE_BUTTON_LABELS = {
  WORK: `${TYPE_EMOJIS.WORK} ${TYPE_LABELS.WORK}`,
  PERSONAL: `${TYPE_EMOJIS.PERSONAL} ${TYPE_LABELS.PERSONAL}`,
} as const;

// ---------------------------------------------------------------------------
// Task status labels
// ---------------------------------------------------------------------------
export const STATUS_LABELS = {
  INBOX: "Da pianificare",
  OPEN: "Pianificato",
  DONE: "Completato",
} as const;

export const STATUS_EMOJIS = {
  INBOX: "📥",
  OPEN: "🗓️",
  DONE: "✅",
} as const;

// ---------------------------------------------------------------------------
// Recurring UI action strings
// ---------------------------------------------------------------------------
export const UI = {
  // Buttons
  CANCEL: "Annulla",
  SAVE: "Salva",
  SAVING: "Salvo...",
  CONFIRM: "Conferma",
  EDIT: "Modifica",
  DELETE: "Elimina",
  COMPLETE: "Completa",
  COMPLETING: "Completo...",
  CREATE: "Crea",
  ADD: "Aggiungi",

  // Loading states
  LOADING: "Caricamento...",
  LOADING_PROJECTS: "Carico progetti...",
  SYNCING: "Sincronizzo...",

  // No project fallback
  NO_PROJECT: "NESSUN PROGETTO",
} as const;

// ---------------------------------------------------------------------------
// Recurring error messages
// ---------------------------------------------------------------------------
export const ERR = {
  SESSION: "Accedi per continuare.",
  SESSION_GENERIC: "Errore sessione.",
  SAVE: "Errore nel salvataggio.",
  LOAD: "Errore nel caricamento.",
  TITLE_REQUIRED: "Inserisci un titolo.",
} as const;
