import { useCallback, useEffect, useRef, useState } from "react";
import { API, type CapabilityInput, type ToolSpec } from "@shared/contract";
import { authHeader } from "../api/client";
import { compile } from "./compiler";
import { registrar } from "./registrar";
import { callTool } from "./transport";
import { recordCapabilityChange } from "./lens";

interface UseCapabilitiesResult {
  specs: ToolSpec[];
  registered: ToolSpec[];
  lastChange: number | null;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches live permission state, compiles it into tool specs, and syncs the
 * registrar. Call `refresh()` after any grant/task/page-state change so the
 * agent-visible tool list updates without a page reload.
 *
 * `taskId` is required: grants are bound to a task, so permission state is
 * meaningless without one. Passing null (before the task has loaded) clears the
 * tool surface rather than leaving stale tools registered — if we do not know
 * what the agent may do, it may do nothing.
 */
export function useCapabilities(taskId: string | null, activeArtifactId: string | null = null): UseCapabilitiesResult {
  const [specs, setSpecs] = useState<ToolSpec[]>([]);
  const [registered, setRegistered] = useState<ToolSpec[]>([]);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevSpecs = useRef<ToolSpec[]>([]);

  const refresh = useCallback(async () => {
    if (!taskId) {
      await registrar.sync([], () => Promise.resolve(""));
      prevSpecs.current = [];
      setSpecs([]);
      setRegistered(registrar.getRegistered());
      return;
    }

    let input: CapabilityInput;
    try {
      const params = new URLSearchParams({ task_id: taskId });
      if (activeArtifactId) params.set("artifact_id", activeArtifactId);
      const res = await fetch(`${API.capabilities}?${params.toString()}`, {
        headers: await authHeader(),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`capabilities request failed (${res.status})`);
      // The worker wraps its payload as { ok, capabilities }. Reading the
      // envelope as the payload would compile an empty permission state and
      // silently unregister every tool.
      const body = (await res.json()) as { ok: boolean; capabilities: CapabilityInput };
      if (!body.ok || !body.capabilities) throw new Error("capabilities response was malformed");
      input = body.capabilities;
    } catch (e) {
      // Surface it. A silent failure here looks exactly like "the agent lost
      // access", which is the one thing this product must never fake.
      setError(e instanceof Error ? e.message : "Could not load capabilities");
      return;
    }

    setError(null);
    const next = compile(input);

    recordCapabilityChange(prevSpecs.current, next);
    prevSpecs.current = next;
    setSpecs(next);

    await registrar.sync(next, (spec, toolInput, signal) => {
      const toolArgs = toolInput as Record<string, unknown>;
      // The browser knows which Workbench artifact registered this tool. Keep
      // page state out of an agent-authored request; the worker still validates
      // the derived version against the current task and permission boundary.
      if (spec.name === "trace_artifact_influences" && activeArtifactId && !toolArgs.version_id && !toolArgs.artifact_id) {
        return callTool(spec.name, { ...toolArgs, artifact_id: activeArtifactId }, signal);
      }
      return callTool(spec.name, toolArgs, signal);
    });
    setRegistered(registrar.getRegistered());
    setLastChange(Date.now());
  }, [taskId, activeArtifactId]);

  useEffect(() => {
    const unsubscribe = registrar.onChange(() => setRegistered(registrar.getRegistered()));
    void refresh();
    return unsubscribe;
  }, [refresh]);

  return { specs, registered, lastChange, error, refresh };
}
