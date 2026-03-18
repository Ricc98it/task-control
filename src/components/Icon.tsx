"use client";

type IconName =
  | "plus"
  | "inbox"
  | "calendar"
  | "check"
  | "edit"
  | "trash"
  | "user-plus"
  | "arrow-left"
  | "arrow-right"
  | "list"
  | "home";

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
};

export default function Icon({ name, size = 18, className }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    className,
  };

  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M4 12l3-6h10l3 6v6H4v-6Z" />
          <path d="M4 12h5l2 3h2l2-3h5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <path d="M7 3v3M17 3v3M4 9h16" />
          <rect x="4" y="6" width="16" height="14" rx="2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l4 4L19 7" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M6 6l1 14h10l1-14" />
          <path d="M10 10v7M14 10v7" />
        </svg>
      );
    case "user-plus":
      return (
        <svg {...common}>
          <path d="M20 8v6M17 11h6" />
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19.2a5.5 5.5 0 0 1 11 0" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...common}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5l9-7 9 7" />
          <path d="M5 10v9h14v-9" />
          <path d="M9 19v-5h6v5" />
        </svg>
      );
    default:
      return null;
  }
}
