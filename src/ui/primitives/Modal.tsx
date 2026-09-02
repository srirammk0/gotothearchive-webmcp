import { useEffect, type ReactNode } from "react";
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
 * locked while open. Deliberately minimal — no focus trap library, the panel
 * autofocuses its close button.
 */
export function Modal({ open, onClose, title, size = "sm", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
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
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: duration.base, ease }}
            className={`w-full ${width[size]} rounded-[var(--radius-lg)] border border-line bg-surface shadow-2xl shadow-black/50`}
          >
            <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-3.5">
              <h2 className="text-section text-text">{title}</h2>
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
