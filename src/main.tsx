import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, Show, SignIn } from "@clerk/react";
import { App } from "./ui/App";
import "./ui/styles.css";

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
