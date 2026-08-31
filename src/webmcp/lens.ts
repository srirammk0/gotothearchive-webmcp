/**
 * Data layer for Agent Lens. Track C renders the visual shell; this file
 * only supplies live data: currently registered tools/schemas, a small
 * in-memory timeline of capability changes and denials, and a deterministic
 * demo driver as a backup if a live agent misbehaves during recording.
 */
import type { ToolName, ToolSpec } from "@shared/contract";
import { registrar } from "./registrar";

export type TimelineEvent =
  | { kind: "registered"; name: ToolName; why: string; at: number }
  | { kind: "unregistered"; name: ToolName; at: number }
  | { kind: "denied"; name: ToolName; input: Record<string, unknown>; reason: string; at: number };

const MAX_EVENTS = 200;
const timeline: TimelineEvent[] = [];

function push(event: TimelineEvent): void {
  timeline.push(event);
  if (timeline.length > MAX_EVENTS) timeline.shift();
}

/** Called by registrar.onChange consumers (see useCapabilities) to log a diff. */
export function recordCapabilityChange(before: ToolSpec[], after: ToolSpec[]): void {
  const beforeNames = new Set(before.map((s) => s.name));
  const afterByName = new Map(after.map((s) => [s.name, s]));
  const at = Date.now();
  for (const spec of after) {
    if (!beforeNames.has(spec.name)) push({ kind: "registered", name: spec.name, why: spec.why, at });
  }
  for (const name of beforeNames) {
    if (!afterByName.has(name)) push({ kind: "unregistered", name, at });
  }
}

export function recordDenial(name: ToolName, input: Record<string, unknown>, reason: string): void {
  push({ kind: "denied", name, input, reason, at: Date.now() });
}

export function getTimeline(): TimelineEvent[] {
  return [...timeline];
}

export function getRegisteredTools(): ToolSpec[] {
  return registrar.getRegistered();
}

/**
 * Deterministic demo driver: replays a fixed sequence of tool calls via the
 * real document.modelContext.getTools()/executeTool() surface. Backup path
 * for video recording if a live ChatGPT agent misbehaves mid-take.
 */
export async function driveDemo(steps: { name: ToolName; input: Record<string, unknown> }[]): Promise<string[]> {
  const mc =
    (typeof document !== "undefined" &&
      (document as unknown as { modelContext?: Record<string, unknown> }).modelContext) ||
    (typeof navigator !== "undefined" &&
      (navigator as unknown as { modelContext?: Record<string, unknown> }).modelContext);
  if (!mc || typeof mc.getTools !== "function" || typeof mc.executeTool !== "function") {
    return steps.map(() => "WebMCP unavailable in this browser — cannot drive demo.");
  }
  const getTools = mc.getTools as () => { name: string }[];
  const executeTool = mc.executeTool as (tool: { name: string }, json: string, opts: { signal: AbortSignal }) => Promise<string>;

  const results: string[] = [];
  for (const step of steps) {
    const tool = getTools().find((t) => t.name === step.name);
    if (!tool) {
      results.push(`Tool "${step.name}" is not currently registered.`);
      continue;
    }
    const controller = new AbortController();
    results.push(await executeTool(tool, JSON.stringify(step.input), { signal: controller.signal }));
  }
  return results;
}
