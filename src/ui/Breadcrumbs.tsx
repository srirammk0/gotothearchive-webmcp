import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "./primitives/Icon";

export interface Crumb {
  label: string;
  to?: string;
}

const TrailContext = createContext<{ trail: Crumb[] | null; setTrail: (c: Crumb[] | null) => void }>({
  trail: [],
  setTrail: () => undefined,
});

/**
 * Routes own their own trail — only the page knows an artifact's title or the
 * region being read. The bar renders whatever the current page published.
 */
export function TrailProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<Crumb[] | null>([]);
  const value = useMemo(() => ({ trail, setTrail }), [trail]);
  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}

/**
 * Publish this page's breadcrumb trail. Cleared automatically on unmount.
 * `null` hides the bar entirely — for a view with its own back affordance,
 * distinct from `[]`/omitted, which still falls back to the route root.
 */
export function useTrail(crumbs: Crumb[] | null) {
  const { setTrail } = useContext(TrailContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    setTrail(JSON.parse(key) as Crumb[] | null);
    return () => setTrail([]);
  }, [key, setTrail]);
}

export function Breadcrumbs() {
  const { trail } = useContext(TrailContext);
  const { pathname } = useLocation();
  if (trail === null) return null;
  // Until the page publishes its own trail, fall back to the route root so the
  // bar never flashes empty between navigations.
  const crumbs: Crumb[] = trail.length
    ? trail
    : [{ label: pathname.startsWith("/workbench") ? "Workbench" : pathname.startsWith("/taste") ? "Taste" : "Archive" }];

  return (
    <div className="mb-3 text-faint">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-meta">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                {i > 0 ? <Icon name="chevronRight" size={12} className="shrink-0 text-faint" /> : null}
                {c.to && !last ? (
                  <Link
                    to={c.to}
                    className="truncate text-muted transition-colors duration-[var(--duration-fast)] hover:text-text"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={`truncate ${last ? "text-muted" : "text-faint"}`}>
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
