/**
 * Wire transport for tool calls. The server is the sole authority (see
 * BUILD-CONTRACT.md invariant #2) — this file never makes an authorization
 * decision, it only shapes the request and turns the response (including
 * denials and network failures) into a string the agent can read.
 */
import { API, DENIAL_REASONS, type Id, type ToolCallResponse, type ToolName } from "@shared/contract";
import { authHeader } from "../api/client";
import { getSession } from "./session";
import { recordDenial } from "./lens";

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function makeAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function isUnknownTool(reason: unknown, status: number): boolean {
  if (status === 404) return true;
  if (typeof reason !== "string") return false;
  return reason === "UNKNOWN_REGION" || reason === DENIAL_REASONS.UNKNOWN_REGION;
}

export async function callTool(
  name: ToolName,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const session = getSession();
  if (!session) {
    return "Denied: no active agent session. The task must be opened before tools can be called.";
  }

  let response: Response;
  try {
    response = await fetch(API.toolCall, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      credentials: "same-origin",
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        tool: name,
        input,
        agent_session_id: session.agentSessionId,
        task_id: session.taskId,
      }),
    });
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return `Could not reach the server to call "${name}". Try again.`;
  }

  let body: ToolCallResponse;
  try {
    body = (await response.json()) as ToolCallResponse;
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    return `The server returned an unreadable response for "${name}" (HTTP ${response.status}).`;
  }

  if (signal?.aborted) throw makeAbortError();

  if (!body.ok) {
    if (isUnknownTool(body.reason, response.status)) {
      return `Unknown tool "${name}". It is not currently registered.`;
    }
    recordDenial(name, input, body.reason);
    return `Denied: ${body.reason}`;
  }

  return JSON.stringify(body.result);
}

export type { Id };
