import { useState } from "react";

/**
 * Logo for an agent product that connects over WebMCP.
 *
 * Prefers a real image dropped into `public/agents/<slug>.png` (transparent,
 * square). Falls back to a built-in monochrome glyph when the file is absent.
 * The agent is matched by a loose substring on its declared client / provider.
 */
const SLUGS: { slug: string; label: string; match: RegExp }[] = [
  { slug: "chatgpt", label: "ChatGPT", match: /openai|chatgpt|\bgpt\b/i },
  { slug: "claude", label: "Claude", match: /anthropic|claude/i },
  { slug: "cursor", label: "Cursor", match: /cursor/i },
  { slug: "github", label: "GitHub", match: /github|copilot/i },
];

const GLYPH: Record<string, { path: string; viewBox: string }> = {
  chatgpt: {
    viewBox: "0 0 24 24",
    path: "M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 22a6.05 6.05 0 0 0 5.77-4.2 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.08zm-9.02 10.78a4.5 4.5 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5zM3.6 16.47a4.48 4.48 0 0 1-.54-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.07.07 0 0 1-.03.06L9.73 20.7a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.35-1.98v5.68a.77.77 0 0 0 .39.67l5.81 3.36-2.02 1.16a.07.07 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.86-5.84-3.4L15.1 7.2a.07.07 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.12v-5.68a.78.78 0 0 0-.39-.68zm2.01-3.03-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.42 7.2V4.86a.07.07 0 0 1 .03-.06l4.83-2.78a4.5 4.5 0 0 1 6.68 4.66zM8.32 12.88l-2.02-1.17a.07.07 0 0 1-.04-.05V6.08a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.47a.78.78 0 0 0-.39.68zm1.1-2.36 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z",
  },
  claude: {
    viewBox: "0 0 24 24",
    path: "M13.83 4h3.6L24 20h-3.6l-1.35-3.5h-6.9L10.8 20H7.2zm-.3 9.6h4.44L15.75 7.9zM6.55 4l-6.35 16H4l1.4-3.6 1.85-4.7L8.9 7.6 7.55 4z",
  },
  cursor: { viewBox: "0 0 24 24", path: "M3 3l18 6.5-8 3-3 8L3 3z" },
  github: {
    viewBox: "0 0 24 24",
    path: "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z",
  },
};

function resolve(name: string): { slug: string; label: string } | null {
  return SLUGS.find((s) => s.match.test(name)) ?? null;
}

export function BrandMark({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const hit = resolve(name);
  const [imgFailed, setImgFailed] = useState(false);

  if (hit && !imgFailed) {
    return (
      <img
        src={`/agents/${hit.slug}.png`}
        alt={hit.label}
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  const g = hit ? GLYPH[hit.slug] : null;
  if (g) {
    return (
      <svg width={size} height={size} viewBox={g.viewBox} fill="currentColor" aria-label={hit?.label} className={className}>
        <path d={g.path} />
      </svg>
    );
  }

  // Unknown agent — a generic terminal mark.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
