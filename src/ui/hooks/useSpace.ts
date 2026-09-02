import type { Region, Space, Task } from "@shared/contract";
import { bootstrap, createTask, listTasks } from "../../api/client";
import { startSession } from "../../webmcp/session";
import { useAsync } from "./useAsync";

export interface UseSpaceResult {
  space: Space | null;
  regions: Region[];
  task: Task | null;
  agentSessionId: string | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_TASK_TITLE = "Spring campaign visual brief";

interface Bootstrapped {
  space: Space;
  regions: Region[];
  task: Task;
  agentSessionId: string;
}

async function bootstrapEverything(): Promise<Bootstrapped> {
  const { space, regions } = await bootstrap();
  const { tasks } = await listTasks();
  const task = tasks.find((t) => t.status === "open") ?? (await createTask(DEFAULT_TASK_TITLE)).task;
  const session = await startSession(task.id);
  return { space, regions, task, agentSessionId: session.agentSessionId };
}

/**
 * App-start bootstrap: space + regions, an open task (created if none exists),
 * and an agent session bound to that task. Everything else in the app depends
 * on this resolving first.
 */
export function useSpace(): UseSpaceResult {
  const { status, data, error } = useAsync(bootstrapEverything, [], "Could not start the archive session.");
  return {
    space: data?.space ?? null,
    regions: data?.regions ?? [],
    task: data?.task ?? null,
    agentSessionId: data?.agentSessionId ?? null,
    loading: status === "loading",
    error,
  };
}
