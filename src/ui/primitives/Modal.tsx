import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";
import { duration, ease } from "../tokens";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Widen for gallery/lightbox use; default is a form-sized panel. */
  size?: "sm" | "lg" | "full";
  children: ReactNode;
}

const width: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  lg: "max-w-3xl",
  full: "max-w-[min(1200px,92vw)]",
};

/**
 * A single centred dialog. Escape and backdrop-click close it; body scroll is
 * locked while open. Focus stays inside the dialog and returns to the element
 * that opened it when the dialog closes.
 */
export function Modal({ open, onClose, title, size = "sm", children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  // Capture the opener during render, before the dialog mounts and any
  // autoFocus descendant can replace document.activeElement.
  if (open && !wasOpenRef.current) {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence
      onExitComplete={() => {
        previouslyFocusedRef.current?.focus();
        previouslyFocusedRef.current = null;
      }}
    >
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fast, ease }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-[8vh] backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: duration.base, ease }}
            className={`w-full ${width[size]} rounded-[var(--radius-lg)] border border-line bg-surface shadow-2xl shadow-black/50`}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-3.5">
              <h2 id={titleId} className="text-section text-text">{title}</h2>
              <button
                type="button"
                autoFocus
                onClick={onClose}
                aria-label="Close"
                className="rounded-[var(--radius-sm)] p-1 text-faint transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
