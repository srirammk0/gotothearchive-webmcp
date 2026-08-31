import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    twttr?: { widgets: { createTweet: (id: string, el: HTMLElement, opts?: Record<string, unknown>) => Promise<unknown> } };
  }
}

/**
 * A real X/Twitter embed. widgets.js (loaded in index.html) renders the tweet
 * into an auto-sized iframe, so there is no fixed height to guess and no
 * internal whitespace — the container shrink-wraps the card.
 */
export function Tweet({ id, className = "" }: { id: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !host.current || !window.twttr) return;
      host.current.replaceChildren();
      void window.twttr.widgets
        .createTweet(id, host.current, { theme: "dark", dnt: true, conversation: "none", align: "center" })
        .then(() => !cancelled && setReady(true));
    };
    if (window.twttr) render();
    else {
      const t = setInterval(() => {
        if (window.twttr) {
          clearInterval(t);
          render();
        }
      }, 120);
      return () => {
        cancelled = true;
        clearInterval(t);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div
      ref={host}
      className={`w-full ${ready ? "" : "animate-pulse rounded-[var(--radius-md)] bg-raised"} ${className}`}
    />
  );
}
