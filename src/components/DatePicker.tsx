"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const MONTHS_SHORT = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
];

const DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function formatISO(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISO(value: string) {
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

function formatDisplay(value: string) {
  const date = parseISO(value);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function getCalendarGrid(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

type DatePickerBaseProps = {
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  size?: "sm" | "md";
  inputClassName?: string;
  wrapperClassName?: string;
  ariaLabel?: string;
};

type DatePickerSingleProps = DatePickerBaseProps & {
  mode?: "single";
  value: string;
  onChange: (value: string) => void;
};

type DatePickerMultiProps = DatePickerBaseProps & {
  mode: "multiple";
  value: string[];
  onChange: (value: string[]) => void;
};

type DatePickerProps = DatePickerSingleProps | DatePickerMultiProps;

function formatDisplayMulti(values: string[]) {
  const sorted = [...values].sort();
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return formatDisplay(sorted[0]);
  if (sorted.length === 2) {
    return `${formatDisplay(sorted[0])}, ${formatDisplay(sorted[1])}`;
  }
  return `${sorted.length} giorni`;
}

export default function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  required,
  id,
  name,
  size = "md",
  inputClassName,
  wrapperClassName,
  ariaLabel,
  mode = "single",
}: DatePickerProps) {
  const isMulti = mode === "multiple";
  const selectedDates = Array.isArray(value)
    ? value.filter(Boolean)
    : value
    ? [value]
    : [];
  const sortedDates = [...selectedDates].sort();
  const selectedSet = new Set(sortedDates);
  const selectedKey = sortedDates[0] ?? "";
  const selectedDate = parseISO(selectedKey);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(
    () => selectedDate ?? new Date()
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const todayISO = formatISO(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setViewDate(selectedDate ?? new Date());
  }, [open, selectedKey]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const days = getCalendarGrid(viewDate);
  const displayValue = isMulti
    ? formatDisplayMulti(sortedDates)
    : formatDisplay(value as string);

  function selectDate(date: Date) {
    if (disabled) return;
    const iso = formatISO(date);
    if (isMulti) {
      const next = new Set(selectedSet);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      const nextList = Array.from(next).sort();
      (onChange as (value: string[]) => void)(nextList);
    } else {
      (onChange as (value: string) => void)(iso);
      setOpen(false);
    }
  }

  function clearDate() {
    if (disabled) return;
    if (isMulti) {
      (onChange as (value: string[]) => void)([]);
    } else {
      (onChange as (value: string) => void)("");
    }
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`date-picker ${wrapperClassName ?? ""}`.trim()}
    >
      <input
        id={id}
        name={name}
        type="text"
        className={`glass-input date-input ${
          size === "sm" ? "date-input-sm" : ""
        } ${inputClassName ?? ""}`.trim()}
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => !disabled && setOpen(true)}
        onClick={() => !disabled && setOpen(true)}
        readOnly
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
      />

      {open && !disabled && (
        mounted &&
        createPortal(
          <div className="date-overlay" onClick={() => setOpen(false)}>
            <div
              id={popoverId}
              ref={popoverRef}
              role="dialog"
              aria-modal="true"
              className={`date-popover ${
                size === "sm" ? "date-popover-sm" : ""
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="date-header">
                <button
                  type="button"
                  className="date-nav"
                  onClick={() => setViewDate(addMonths(viewDate, -1))}
                >
                  {"<"}
                </button>
                <span className="date-title">
                  {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                </span>
                <button
                  type="button"
                  className="date-nav"
                  onClick={() => setViewDate(addMonths(viewDate, 1))}
                >
                  {">"}
                </button>
              </div>

              <div className="date-grid">
                {DAYS.map((day) => (
                  <span key={day} className="date-weekday">
                    {day}
                  </span>
                ))}
                {days.map((date) => {
                  const iso = formatISO(date);
                  const isOutside = date.getMonth() !== viewDate.getMonth();
                  const isSelected = selectedSet.has(iso);
                  const isToday = iso === todayISO;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`date-day ${
                        isOutside ? "date-day-outside" : ""
                      } ${isSelected ? "date-day-selected" : ""} ${
                        isToday ? "date-day-today" : ""
                      }`}
                      onClick={() => selectDate(date)}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="date-actions">
                <button
                  type="button"
                  className="date-action"
                  onClick={() => selectDate(new Date())}
                >
                  Oggi
                </button>
                <button
                  type="button"
                  className="date-action"
                  onClick={clearDate}
                  disabled={sortedDates.length === 0}
                >
                  Pulisci
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </div>
  );
}
