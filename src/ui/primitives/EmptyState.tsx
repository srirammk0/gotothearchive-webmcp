import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}

/** Inviting, not a metrics readout. A rule and some air, nothing more. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-2 border-t border-line-soft py-10">
      <p className="text-section text-text">{title}</p>
      {body ? <p className="max-w-prose text-body leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
