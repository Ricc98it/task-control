"use client";

import { type ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export default function SectionHeader({
  title,
  subtitle,
  right,
}: SectionHeaderProps) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {right ? (
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      ) : subtitle ? (
        <span className="section-subtitle">{subtitle}</span>
      ) : null}
    </div>
  );
}
