import type { ReactNode } from "react";

/**
 * The right-rail panel shape shared by Agent Access, agent activity, and taste
 * usage: a hairline top border, a quiet section title, sticky on wide screens.
 */
export function SidePanel({
  title,
  label,
  sticky = true,
  children,
}: {
  title: string;
  label?: ReactNode;
  /** Stick to the viewport on wide screens. Turn off when stacked with siblings. */
  sticky?: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className={`flex h-fit flex-col gap-4 border-t border-line pt-4 ${sticky ? "lg:sticky lg:top-20" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-section text-text">{title}</p>
        {label ? <span className="text-micro text-faint">{label}</span> : null}
      </div>
      {children}
    </aside>
  );
}
