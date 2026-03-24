"use client";

import { useEffect, useRef, useState } from "react";
import { getTimeOptionIndex, TIME_OPTIONS } from "@/app/calls/utils";

type CallsTimePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

export default function CallsTimePicker({
  label,
  value,
  onChange,
  disabled,
}: CallsTimePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!menuRef.current) return;
    const activeIndex = getTimeOptionIndex(value);
    const itemHeight = 32;
    const nextScrollTop = Math.max(0, (activeIndex - 2) * itemHeight);
    menuRef.current.scrollTop = nextScrollTop;
  }, [isOpen, value]);

  return (
    <div className="calls-create-time-field calls-time-dropdown" ref={rootRef}>
      <span className="calls-create-time-caption" aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        className="glass-input calls-time-overlay-trigger calls-time-dropdown-trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label={`Seleziona ora ${label.toLowerCase()}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value}</span>
        <span className="calls-time-overlay-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div className="calls-time-dropdown-menu" role="listbox" ref={menuRef}>
          {TIME_OPTIONS.map((option) => (
            <button
              key={`${label}-${option}`}
              type="button"
              className={`calls-time-dropdown-option ${
                option === value ? "is-active" : ""
              }`.trim()}
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
