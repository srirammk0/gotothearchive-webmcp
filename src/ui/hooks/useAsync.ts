import { useEffect, useState } from "react";

export interface AsyncState<T> {
  status: "loading" | "error" | "ready";
  data: T | null;
  error: string | null;
}

/**
 * Runs `fn` once whenever `deps` changes, ignoring a result that resolves
 * after the effect was superseded (deps changed again, or the component
 * unmounted) — the "let cancelled = false" fetch-effect, generalized.
 *
 * Only fits a single fetch-on-mount/deps-change. A poll, a multi-request
 * bootstrap with per-request fallbacks, or a "silent background refresh that
 * never flips to the error state" (Stats.tsx) is its own effect — forcing
 * that shape through this hook would need it to grow options for a single
 * caller, which is worse than the duplication it would remove.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], fallback: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: null });
    fn()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", data: null, error: err instanceof Error ? err.message : fallback });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied dep list, not this hook's own state
  }, deps);

  return state;
}
