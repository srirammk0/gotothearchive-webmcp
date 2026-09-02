import type { ReactNode } from "react";

export interface MetaRow {
  label: string;
  value: ReactNode;
}

/** Are.na-style key/value strip. Definition list, tight rows, quiet keys. */
export function MetaList({ rows }: { rows: MetaRow[] }) {
  return (
    <dl className="flex flex-col">
      {rows
        .filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
        .map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-6 border-b border-line-soft py-1.5 last:border-0"
          >
            <dt className="shrink-0 text-micro text-faint">{r.label}</dt>
            <dd className="min-w-0 truncate text-right text-micro text-muted">{r.value}</dd>
          </div>
        ))}
    </dl>
  );
}
