"use client";

import { useId } from "react";

type IosToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
};

export default function IosToggleRow({
  label,
  checked,
  onChange,
  description,
  disabled = false,
}: IosToggleRowProps) {
  const inputId = useId();
  return (
    <label
      htmlFor={inputId}
      className={`calls-ios-toggle-row ${disabled ? "is-disabled" : ""}`.trim()}
    >
      <div className="calls-ios-toggle-copy">
        <p className="calls-ios-toggle-label">{label}</p>
        {description ? <p className="calls-ios-toggle-description">{description}</p> : null}
      </div>
      <span className="calls-ios-toggle-wrap">
        <input
          id={inputId}
          type="checkbox"
          className="calls-ios-toggle-input"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          aria-label={label}
        />
        <span className="calls-ios-toggle" aria-hidden="true">
          <span className="calls-ios-toggle-knob" />
        </span>
      </span>
    </label>
  );
}
