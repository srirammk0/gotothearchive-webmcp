import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

/** Inviting, not a metrics readout. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 border-t border-hairline py-12">
      <p className="font-serif text-[length:var(--text-section)] text-ink">{title}</p>
      {body ? <p className="max-w-prose font-sans text-[length:var(--text-body)] text-ink-soft">{body}</p> : null}
      {action}
    </div>
  );
}
