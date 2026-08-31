import { useId, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

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
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] py-2 text-left text-[length:var(--text-meta)] text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
      >
        <span>{summary}</span>
        <Icon
          name="chevronRight"
          size={14}
          className="shrink-0 text-faint transition-transform duration-[var(--duration-base)]"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </button>
      <div
        id={panelId}
        className="grid transition-[grid-template-rows,opacity] duration-[var(--duration-base)]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
