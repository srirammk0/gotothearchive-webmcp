/**
 * Design tokens mirrored from styles.css `@theme`, for use in TS/JS where a
 * literal value is needed (e.g. computed inline styles). Prefer Tailwind
 * utility classes (bg-paper, text-ink, font-serif, etc.) wherever possible —
 * this module exists only for the cases a class can't reach.
 */
export const color = {
  paper: "#f4f1ea",
  paperRaised: "#ece7db",
  ink: "#211d17",
  inkSoft: "#57503f",
  stone: "#8a8071",
  stoneSoft: "#a9a08f",
  hairline: "#d9d1bf",
  accent: "#b8481f",
  accentSoft: "#e9c9ba",
  good: "#4a6b4d",
  bad: "#a8402a",
} as const;

export const font = {
  serif: `"Spectral", "Iowan Old Style", Georgia, serif`,
  sans: `"Inter", ui-sans-serif, system-ui, sans-serif`,
  mono: `"SF Mono", ui-monospace, monospace`,
} as const;

export const duration = {
  fast: 120,
  base: 220,
  slow: 360,
} as const;

export const ease = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;
