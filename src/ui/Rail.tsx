import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { motion } from "motion/react";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { getQuota, type QuotaInfo } from "../api/client";

const destinations = [
  { to: "/", label: "Archive", end: true },
  { to: "/workbench", label: "Workbench", end: false },
  { to: "/taste", label: "Taste", end: false },
  { to: "/stats", label: "Stats", end: false },
];

/**
 * The only persistent chrome: wordmark, where you are, where else you can go.
 * A hairline under the active destination is the entire active treatment — it
 * slides between them rather than appearing and disappearing.
 */
export function Rail() {
  return (
    <header className="sticky top-0 z-30 bg-canvas">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-5 sm:px-8">
        <nav aria-label="Primary" className="flex shrink-0 items-center gap-1">
          {destinations.map((d) => (
            <NavLink key={d.to} to={d.to} end={d.end} className="relative px-2 py-3.5">
              {({ isActive }) => (
                <>
                  <span
                    className={`text-meta transition-colors duration-[var(--duration-fast)] ${
                      isActive ? "text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    {d.label}
                  </span>
                  {isActive ? (
                    <motion.span
                      layoutId="nav-underline"
                      transition={{ type: "spring", stiffness: 520, damping: 44 }}
                      className="absolute inset-x-1 -bottom-px h-px bg-text"
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <Account />
          <BetaBadge />
        </div>
      </div>
    </header>
  );
}

/**
 * Small, quiet marker that this is a closed beta with a per-member quota.
 * Links to Stats where the full usage breakdown lives.
 */
function BetaBadge() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    const refresh = () => getQuota().then((r) => setQuota(r.quota)).catch(() => undefined);
    refresh();
    // A same-tab mutation (e.g. deleting an artifact refunds quota) should
    // reflect here right away, not wait for a remount.
    window.addEventListener("api:mutated", refresh);
    return () => window.removeEventListener("api:mutated", refresh);
  }, []);

  return (
    <NavLink
      to="/stats"
      title={
        quota
          ? `Beta member ${quota.beta.slot} of ${quota.beta.max} · quota resets monthly`
          : "Closed beta"
      }
      className="shrink-0 rounded-[var(--radius-sm)] bg-accent/15 px-1.5 py-px text-micro text-accent transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
    >
      Beta{quota?.beta.slot ? ` ${quota.beta.slot}/${quota.beta.max}` : ""}
    </NavLink>
  );
}

/**
 * Signed-out visitors keep working as a guest — the archive is usable before an
 * account exists — so this offers sign-in rather than demanding it. Renders
 * nothing when Clerk is not configured.
 */
function Account() {
  if (!import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <div className="flex shrink-0 items-center">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button
            type="button"
            className="text-meta text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
          >
            Sign in
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
