/**
 * agent_session_id lifecycle. Bound to the authenticated human + active task.
 *
 * A client may self-declare {provider, client, model}. This is ATTRIBUTION
 * ONLY — per BUILD-CONTRACT.md invariant #9 and webmcp-capability-layer.md,
 * declared identity is spoofable and must NEVER influence authorization.
 * Every call is still authorized server-side purely from the authenticated
 * session, human access, task, and live grant.
 */
import type { Id } from "@shared/contract";

export interface DeclaredIdentity {
  provider?: string;
  client?: string;
  model?: string;
}

interface SessionState {
  agentSessionId: Id;
  taskId: Id;
  declared: DeclaredIdentity | null;
}

let current: SessionState | null = null;

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Start (or restart) a session bound to a task. Call again whenever the active task changes. */
export function startSession(taskId: Id, declared: DeclaredIdentity | null = null): SessionState {
  current = { agentSessionId: randomId(), taskId, declared };
  return current;
}

export function declareIdentity(declared: DeclaredIdentity): void {
  if (!current) return;
  // Attribution only — see file header. Never read for authorization decisions.
  current = { ...current, declared };
}

export function getSession(): SessionState | null {
  return current;
}
