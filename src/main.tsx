import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, Show, SignIn } from "@clerk/react";
import { App } from "./ui/App";
import "./ui/styles.css";

// Judge demo entry (docs/roadmap/judge-demo-access.md). `/demo?demo_exp=&demo_sig=`
// stashes the signed token, then hands off to the normal Clerk sign-in; the
// client replays it on the bootstrap POST, where the worker provisions a guest
// space. `&reset=1` re-seeds an existing guest space.
try {
  const u = new URL(location.href);
  if (u.pathname === "/demo") {
    const exp = u.searchParams.get("demo_exp");
    const sig = u.searchParams.get("demo_sig");
    if (exp && sig) {
      sessionStorage.setItem(
        "demo-token",
        JSON.stringify({ exp, sig, reset: u.searchParams.get("reset") === "1" }),
      );
    }
    history.replaceState(null, "", "/");
  }
} catch {
  // no URL / storage access — fall through to the normal app
}

// Every API route is anchored to a Clerk identity, so the app is gated at the
// root rather than per-route: signed out, there is nothing to show.
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
        <div className="flex min-h-full items-center justify-center p-8">
          <SignIn routing="hash" />
        </div>
      </Show>
    </ClerkProvider>
  </StrictMode>,
);
