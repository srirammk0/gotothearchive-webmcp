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
 * cookies (it follows a redirect to the app; we ignore the body), then reload
 * into <App demo />. If that route is unavailable — no signing secret — fall
 * back to a plain sign-in screen instead of looping.
 */
let demoEntryStarted = false;

function DemoEntry() {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
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
      setUnavailable(true);
      return;
    }
    fetch("/api/demo-entry")
      .then((res) => {
        if (res.ok) window.location.reload();
        else setUnavailable(true);
      })
      .catch(() => setUnavailable(true));
  }, []);

  return unavailable ? <SignInScreen /> : null;
}

function SignInScreen() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 p-8">
      <SignIn routing="hash" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <Show when="signed-in">
        <App />
      </Show>
      <Show when="signed-out">{hasDemoSession ? <App demo /> : <DemoEntry />}</Show>
    </ClerkProvider>
  </StrictMode>,
);
