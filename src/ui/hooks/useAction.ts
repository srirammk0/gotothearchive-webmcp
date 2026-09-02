import { useState } from "react";
import { errorMessage } from "../../api/client";

/**
 * The busy/error wrapper around a one-off write: set busy, clear the last
 * error, run it, catch a failure into a message, always clear busy. `run`
 * resolves to whether it succeeded, so a caller that should only fire a
 * side effect (close a modal, clear a selection) on success — never on a
 * failed write, where the error should stay up so the user can retry — can
 * await it instead of nesting that logic inside the action itself.
 */
export function useAction(fallback = "That didn't work.") {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, run, clearError: () => setError(null) };
}
