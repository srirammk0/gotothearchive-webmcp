/**
 * Design tokens mirrored from styles.css `@theme`, for use in TS/JS where a
 * literal value is needed (e.g. computed inline styles or motion variants).
 * Prefer Tailwind utility classes (bg-surface, text-muted, …) where possible.
 */
export const color = {
  canvas: "#0f0f0e",
  surface: "#1a1a19",
  raised: "#232322",
  hover: "#2b2b29",
  line: "#2e2e2c",
  lineSoft: "#242423",
  text: "#f2f0ec",
  muted: "#a39e95",
  faint: "#6f6a62",
  accent: "#e34927",
  good: "#7ea87c",
  bad: "#e0664a",
} as const;

export const font = {
  sans: `"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif`,
  mono: `ui-monospace, "SF Mono", monospace`,
} as const;

export const duration = { fast: 0.14, base: 0.26, slow: 0.42 } as const;

/** Motion's array form of the CSS --ease-out curve. */
export const ease = [0.22, 1, 0.36, 1] as const;
