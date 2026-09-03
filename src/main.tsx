import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, Show, SignIn } from "@clerk/react";
import { App } from "./ui/App";
import "./ui/styles.css";

// Judge demo access (docs/roadmap/judge-demo-access.md). /api/demo-entry sets an
// HttpOnly `demo_session` cookie (the credential — only the worker reads it) plus
// a readable `demo_hint`, then redirects here. The hint is all this gate needs:
// a demo visitor has no Clerk session, so without it they would only ever see
// the sign-in form.
const demoMode = (() => {
  try {
    return document.cookie.split("; ").some((c) => c === "demo_hint=1");
  } catch {
    return false;
  }
})();

// Every API route is anchored to an identity, so the app is gated at the root
// rather than per-route: a real member signs in; a demo visitor carries the
// cookie; anyone else has nothing to show.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
    >
      <Show when="signed-in">
        <App />
      </Show>
      <Show when="signed-out">
        {demoMode ? (
          <App demo />
        ) : (
          <div className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
            <SignIn routing="hash" />
            <p className="max-w-xs text-center text-meta text-muted">
              <a
                href="/api/demo-entry"
                className="underline decoration-line underline-offset-2 transition-colors duration-[var(--duration-fast)] hover:text-text focus-visible:text-accent"
              >
                Open judge demo access
              </a>
              <span className="mt-1 block text-micro">
                A ready-made archive to explore and break — shared with the other judges, separate from anything of your own.
              </span>
            </p>
          </div>
        )}
      </Show>
    </ClerkProvider>
  </StrictMode>,
);
