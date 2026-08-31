import type { GrantLevel } from "@shared/contract";

/**
 * Line-weight glyphs for the four grant states — never emoji, never a filled
 * chip. State must read from the icon shape AND the accompanying word, so it
 * never depends on colour alone (visual-system.md, WCAG AA).
 */
function Glyph({ level }: { level: GrantLevel }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (level) {
    case "none":
      // Closed padlock outline.
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "read":
      // Eye outline.
      return (
        <svg {...common}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.75" />
        </svg>
      );
    case "propose":
      // Pencil with a small suggestion dot.
      return (
        <svg {...common}>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="M13 5.5 17.5 10" />
          <circle cx="19.5" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "write":
      // Solid pencil — the most permissive state.
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M4 20h4l10.3-10.3-4-4L4 16v4Z" />
          <path d="m15.7 4.3 4 4 1.6-1.6a1.8 1.8 0 0 0 0-2.5l-1.5-1.5a1.8 1.8 0 0 0-2.5 0Z" />
        </svg>
      );
  }
}

export function GrantIcon({ level, className = "" }: { level: GrantLevel; className?: string }) {
  return (
    <span className={className}>
      <Glyph level={level} />
    </span>
  );
}
