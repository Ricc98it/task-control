"use client";

import { type LiHTMLAttributes, type ReactNode } from "react";

type ListRowProps = LiHTMLAttributes<HTMLLIElement> & {
  children: ReactNode;
};

export default function ListRow({ children, className, ...props }: ListRowProps) {
  return (
    <li className={`list-row ${className ?? ""}`.trim()} {...props}>
      {children}
    </li>
  );
}
