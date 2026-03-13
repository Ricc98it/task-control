"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type SelectOption = {
  value: string;
  label: string;
  tone?: string;
  description?: string;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  showToneDot?: boolean;
  createPlaceholder?: string;
  onCreateOption?: (label: string) => Promise<void> | void;
  maxVisibleOptions?: number;
};

export default function Select({
  value,
  onChange,
  options,
  placeholder = "Seleziona",
  ariaLabel,
  disabled = false,
  size = "md",
  className,
  showToneDot = true,
  createPlaceholder,
  onCreateOption,
  maxVisibleOptions,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [creatingOption, setCreatingOption] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const createCandidate = newOptionLabel.trim();

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
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

  function toggleOpen() {
    if (disabled) return;
    setOpen((prev) => {
      if (prev) return false;
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
      return true;
    });
  }

  function chooseOption(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  async function handleCreateOption() {
    if (!onCreateOption || creatingOption) return;
    const next = newOptionLabel.trim();
    if (!next) return;

    setCreatingOption(true);
    try {
      await onCreateOption(next);
      setNewOptionLabel("");
      setOpen(false);
    } finally {
      setCreatingOption(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    const total = options.length;
    if (total === 0) return;

    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, total - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(total - 1);
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) chooseOption(option);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`select-shell ${className ?? ""}`.trim()}
    >
      <button
        type="button"
        className={`select-button ${size === "sm" ? "select-button-sm" : ""}`}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-opt-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        role="combobox"
      >
        <span className="select-value">
          {showToneDot && selectedOption?.tone ? (
            <span
              className={`select-dot select-dot-${selectedOption.tone}`}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={`select-value-text ${
              selectedOption ? "" : "select-value-muted"
            }`.trim()}
          >
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <span className={`select-caret ${open ? "select-caret-open" : ""}`}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M5 7l5 6 5-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div
          className={`select-menu ${size === "sm" ? "select-menu-sm" : ""}`}
          role="listbox"
          id={listId}
        >
          {onCreateOption ? (
            <div className="select-create-row">
              <input
                type="text"
                className="glass-input select-create-input"
                value={newOptionLabel}
                onChange={(event) => setNewOptionLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void handleCreateOption();
                }}
                placeholder={createPlaceholder ?? "Nuovo elemento"}
                disabled={creatingOption}
                aria-label={createPlaceholder ?? "Nuovo elemento"}
              />
            </div>
          ) : null}

          {onCreateOption && createCandidate ? (
            <button
              type="button"
              className="select-option select-option-create"
              onClick={() => {
                void handleCreateOption();
              }}
            >
              <span className="select-option-label">
                Aggiungi &quot;{createCandidate}&quot;
              </span>
            </button>
          ) : null}

          <div
            className="select-options-scroll"
            style={
              maxVisibleOptions
                ? { maxHeight: `${Math.max(1, maxVisibleOptions) * 48}px` }
                : undefined
            }
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <button
                  type="button"
                  key={option.value}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`select-option ${
                    option.tone ? `select-tone-${option.tone}` : ""
                  }`}
                  data-selected={isSelected ? "true" : "false"}
                  data-active={isActive ? "true" : "false"}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => chooseOption(option)}
                >
                  <span className="select-option-label">
                    {showToneDot && option.tone ? (
                      <span
                        className={`select-dot select-dot-${option.tone}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{option.label}</span>
                  </span>
                  {option.description ? (
                    <span className="select-option-desc">{option.description}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
