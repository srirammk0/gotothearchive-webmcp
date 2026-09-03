import { useState } from "react";

const DISMISS_KEY = "demo-banner-dismissed-v1";

function initiallyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The strip a judge sees on every demo page. The demo is one archive shared by
 * every visitor with no sign-in, so the two things it has to say are "this is
 * not your data" and "everyone here sees what you do". Dismissable, because a
 * judge exploring for twenty minutes does not need it in view the whole time;
 * the dismissal is per-browser and versioned, so a reworded message comes back.
 */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode / storage disabled — closing for this view is enough
    }
    setDismissed(true);
  };

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] items-start gap-3 px-5 py-2 sm:px-8">
        <p className="flex-1 text-micro leading-relaxed text-muted">
          <span className="text-text">Shared demo archive.</span> No sign-in —
          every visitor works in this same archive, so anything you change the
          other judges see, and they can change yours. Nothing here is private and
          none of it is real personal data. Reopen your link to reset it.{" "}
          <a
            href="https://github.com/srirammk0/gotothearchive-webmcp/blob/main/docs/judges.md"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line underline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:text-accent"
          >
            How the demo works
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss demo notice"
          className="shrink-0 text-micro text-muted transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:text-accent"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
