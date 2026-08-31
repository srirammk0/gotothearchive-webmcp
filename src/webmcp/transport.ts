/**
 * Wire transport for tool calls. The server is the sole authority (see
 * BUILD-CONTRACT.md invariant #2) — this file never makes an authorization
 * decision, it only shapes the request and turns the response (including
 * denials and network failures) into a string the agent can read.
 */
import { API, type Id, type ToolCallResponse, type ToolName } from "@shared/contract";
import { getSession } from "./session";
import { recordDenial } from "./lens";

export async function callTool(name: ToolName, input: Record<string, unknown>): Promise<string> {
  const session = getSession();
  if (!session) {
    return "Denied: no active agent session. The task must be opened before tools can be called.";
  }

  let response: Response;
  try {
    response = await fetch(API.toolCall, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: name,
        input,
        agent_session_id: session.agentSessionId,
        task_id: session.taskId,
      }),
    });
  } catch {
    return `Could not reach the server to call "${name}". Try again.`;
  }

  let body: ToolCallResponse;
  try {
    body = (await response.json()) as ToolCallResponse;
  } catch {
    return `The server returned an unreadable response for "${name}" (HTTP ${response.status}).`;
  }

  if (!body.ok) {
    recordDenial(name, input, body.reason);
    return `Denied: ${body.reason}`;
  }

  return JSON.stringify(body.result);
}

export type { Id };
