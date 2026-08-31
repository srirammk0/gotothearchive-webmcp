/**
 * agent_session_id lifecycle. Bound to the authenticated human + active task.
 *
 * A client may self-declare {provider, client, model}. This is ATTRIBUTION
 * ONLY — per BUILD-CONTRACT.md invariant #9 and webmcp-capability-layer.md,
 * declared identity is spoofable and must NEVER influence authorization.
 * Every call is still authorized server-side purely from the authenticated
 * session, human access, task, and live grant.
 */
import { API, type Id } from "@shared/contract";

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

/**
 * Start (or restart) a session bound to a task. Call again whenever the active
 * task changes.
 *
 * The session id is issued by the SERVER. The client deliberately does not mint
 * one: an id the client chose would let a caller name its own session and so
 * choose which human or task it appears to belong to. The server refuses any
 * call whose session it did not issue (DENIAL_REASONS.UNKNOWN_SESSION).
 */
export async function startSession(
  taskId: Id,
  declared: DeclaredIdentity | null = null,
): Promise<SessionState> {
  const res = await fetch(API.session, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ task_id: taskId, declared }),
  });
  if (!res.ok) throw new Error(`Could not start an agent session (${res.status})`);
  const data = (await res.json()) as { agent_session_id: Id };
  current = { agentSessionId: data.agent_session_id, taskId, declared };
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
