import { createContext, useContext, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useSpace } from "../ui/hooks/useSpace";
import { useCapabilities, type UseCapabilitiesResult } from "./useCapabilities";

/**
 * `/workbench/<id>` → `<id>`; null on every other route, bare `/workbench`
 * included. Parsed from the pathname rather than `useParams` because the
 * provider mounts above `<Routes>`, where route params are not in scope.
 */
export function activeArtifactIdFromPath(pathname: string): string | null {
  return /^\/workbench\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

const WebMcpContext = createContext<UseCapabilitiesResult | null>(null);

/**
 * The single owner of `registrar.sync`. Mounted unconditionally on every route
 * (see App.tsx) so the real compiled tool surface reaches the WebMCP registry
 * on page load — not only once a route or panel that calls `useCapabilities`
 * happens to mount. Exactly one live `useCapabilities` instance app-wide:
 * two would fight over the registry with different specs.
 */
export function WebMcpProvider({ children }: { children: ReactNode }) {
  const { task } = useSpace();
  const activeArtifactId = activeArtifactIdFromPath(useLocation().pathname);
  const capabilities = useCapabilities(task?.id ?? null, activeArtifactId);
  return <WebMcpContext.Provider value={capabilities}>{children}</WebMcpContext.Provider>;
}

/** Read the shared capability state. Throws outside `<WebMcpProvider>`. */
export function useWebMcp(): UseCapabilitiesResult {
  const ctx = useContext(WebMcpContext);
  if (!ctx) throw new Error("useWebMcp must be used inside <WebMcpProvider>");
  return ctx;
}
