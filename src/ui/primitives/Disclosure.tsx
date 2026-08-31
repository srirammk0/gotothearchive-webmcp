import { useId, useState, type ReactNode } from "react";

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Fired the first time the panel opens. For lazily loading its contents. */
  onOpen?: () => void;
}

/** Inline expansion, preferred over modals per the visual system. */
export function Disclosure({ summary, children, defaultOpen = false, className = "", onOpen }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => {
            if (!o) onOpen?.();
            return !o;
          });
        }}
        className="flex w-full items-center justify-between gap-3 py-2 text-left font-sans text-[length:var(--text-meta)] text-ink-soft hover:text-ink"
      >
        <span>{summary}</span>
        <span
          aria-hidden="true"
          className="text-stone transition-transform duration-[var(--duration-fast)]"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &rsaquo;
        </span>
      </button>
      <div
        id={panelId}
        className="grid overflow-hidden transition-[grid-template-rows] duration-[var(--duration-base)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0">{children}</div>
      </div>
    </div>
  );
}
