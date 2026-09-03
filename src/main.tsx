import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, Show, SignIn } from "@clerk/react";
import { App } from "./ui/App";
import "./ui/styles.css";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// The demo is the default unauthenticated view. /api/demo-entry sets an HttpOnly
// `demo_session` cookie (the credential — only the worker reads it) plus a
// readable `demo_hint`; a signed-out visitor without the hint is sent through
// that route once to pick both up, then lands back here in demo mode. Members
// sign in from the rail.
const hasDemoSession = (() => {
  try {
    return document.cookie.split("; ").some((c) => c === "demo_hint=1");
  } catch {
    return false;
  }
})();

/**
 * Signed out and no demo session yet: call /api/demo-entry once to pick up the
 * cookies (it follows a redirect to the app; we ignore the body), then render
 * <App demo /> directly — the `demo_session` cookie is in the jar by the time
 * the fetch resolves, so the normal bootstrap authenticates with it. No page
 * reload: a reload mid-load derails a WebMCP capture. If that route is
 * unavailable — no signing secret — fall back to a plain sign-in screen
 * instead of looping.
 */
let demoEntryStarted = false;

function DemoEntry() {
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable">(
    hasDemoSession ? "ready" : "loading",
  );

  useEffect(() => {
    if (phase !== "loading") return;
    if (demoEntryStarted) return; // StrictMode double-invoke, or a re-mount
    demoEntryStarted = true;

    let triedBefore = false;
    try {
      triedBefore = sessionStorage.getItem("demo-entry-tried") === "1";
      sessionStorage.setItem("demo-entry-tried", "1");
    } catch {
      // no storage — proceed without the cross-reload guard
    }
    if (triedBefore) {
      setPhase("unavailable");
      return;
    }
    fetch("/api/demo-entry")
      .then((res) => setPhase(res.ok ? "ready" : "unavailable"))
      .catch(() => setPhase("unavailable"));
  }, [phase]);

  if (phase === "ready") return <App demo />;
  if (phase === "unavailable") return <SignInScreen />;
  return null;
}

function SignInScreen() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <SignIn routing="hash" />
    </div>
  );
}

const demoView = <DemoEntry />;

// Clerk is optional. With no key the deployment is demo-only: skip the provider
// entirely so nothing on the page waits on a Clerk that will never load (a
// keyless build for a pure-demo host like webmcp.ora.ai). With a key, a member
// session renders the full app and signed-out falls through to the demo.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {CLERK_KEY ? (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
        <Show when="signed-in">
          <App />
        </Show>
        <Show when="signed-out">{demoView}</Show>
      </ClerkProvider>
    ) : (
      demoView
    )}
  </StrictMode>,
);
