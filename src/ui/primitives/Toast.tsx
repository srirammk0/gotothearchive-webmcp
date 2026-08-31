import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface ToastProps {
  tone?: "neutral" | "success" | "error";
  children: ReactNode;
  onDismiss?: () => void;
}

const toneClass: Record<NonNullable<ToastProps["tone"]>, string> = {
  neutral: "text-text",
  success: "text-good",
  error: "text-bad",
};

/** A single transient message. Caller owns mount/unmount + timing. */
export function Toast({ tone = "neutral", children, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-line bg-raised px-4 py-3 text-[length:var(--text-meta)] shadow-lg shadow-black/40 ${toneClass[tone]}`}
    >
      <span>{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-full p-1 text-faint transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-text"
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}
