import type { ReactNode } from "react";

export interface ToastProps {
  tone?: "neutral" | "success" | "error";
  children: ReactNode;
  onDismiss?: () => void;
}

const toneClass: Record<NonNullable<ToastProps["tone"]>, string> = {
  neutral: "border-hairline text-ink",
  success: "border-good text-good",
  error: "border-bad text-bad",
};

/** A single transient message. Caller owns mount/unmount + timing. */
export function Toast({ tone = "neutral", children, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-4 rounded-[var(--radius-sm)] border bg-paper px-4 py-3 font-sans text-[length:var(--text-meta)] shadow-sm ${toneClass[tone]}`}
    >
      <span>{children}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-stone hover:text-ink"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
