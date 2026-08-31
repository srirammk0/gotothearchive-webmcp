import { useEffect, useState } from "react";
import type { Region, Space, Task } from "@shared/contract";
import { bootstrap, createTask, listTasks } from "../../api/client";
import { startSession } from "../../webmcp/session";

export interface UseSpaceResult {
  space: Space | null;
  regions: Region[];
  task: Task | null;
  agentSessionId: string | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_TASK_TITLE = "Spring campaign visual brief";

/**
 * App-start bootstrap: space + regions, an open task (created if none exists),
 * and an agent session bound to that task. Everything else in the app depends
 * on this resolving first.
 */
export function useSpace(): UseSpaceResult {
  const [state, setState] = useState<Omit<UseSpaceResult, "loading" | "error">>({
    space: null,
    regions: [],
    task: null,
    agentSessionId: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { space, regions } = await bootstrap();
        const { tasks } = await listTasks();
        const task = tasks.find((t) => t.status === "open") ?? (await createTask(DEFAULT_TASK_TITLE)).task;
        const session = await startSession(task.id);
        if (cancelled) return;
        setState({ space, regions, task, agentSessionId: session.agentSessionId });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not start the archive session.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, loading, error };
}
