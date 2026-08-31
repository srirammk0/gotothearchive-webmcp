import { useCallback, useEffect, useRef, useState } from "react";
import { API, type CapabilityInput, type ToolSpec } from "@shared/contract";
import { compile } from "./compiler";
import { registrar } from "./registrar";
import { callTool } from "./transport";
import { recordCapabilityChange } from "./lens";

interface UseCapabilitiesResult {
  specs: ToolSpec[];
  registered: ToolSpec[];
  lastChange: number | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches live permission state, compiles it into tool specs, and syncs the
 * registrar. Call `refresh()` after any grant/task/page-state change so the
 * agent-visible tool list updates without a page reload.
 */
export function useCapabilities(): UseCapabilitiesResult {
  const [specs, setSpecs] = useState<ToolSpec[]>([]);
  const [registered, setRegistered] = useState<ToolSpec[]>([]);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const prevSpecs = useRef<ToolSpec[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch(API.capabilities);
    if (!res.ok) return;
    const input = (await res.json()) as CapabilityInput;
    const next = compile(input);

    recordCapabilityChange(prevSpecs.current, next);
    prevSpecs.current = next;
    setSpecs(next);

    await registrar.sync(next, (spec, toolInput) => callTool(spec.name, toolInput as Record<string, unknown>));
    setRegistered(registrar.getRegistered());
    setLastChange(Date.now());
  }, []);

  useEffect(() => {
    const unsubscribe = registrar.onChange(() => setRegistered(registrar.getRegistered()));
    void refresh();
    return unsubscribe;
  }, [refresh]);

  return { specs, registered, lastChange, refresh };
}
