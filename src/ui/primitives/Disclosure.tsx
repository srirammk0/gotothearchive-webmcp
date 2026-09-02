import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { duration, ease } from "../tokens";

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
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] py-2 text-left text-meta text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
      >
        <span>{summary}</span>
        <Icon
          name="chevronDown"
          size={14}
          className={`shrink-0 text-faint transition-transform duration-[var(--duration-base)] ${
            open ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
