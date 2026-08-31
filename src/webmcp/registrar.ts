/**
 * Diffing registrar — keeps document.modelContext in sync with a desired
 * ToolSpec[] without churning tools that haven't actually changed.
 *
 * `document.modelContext` is the live (Chrome 150+) WebMCP surface.
 * `navigator.modelContext` is deprecated and is only used as a fallback for
 * older builds that haven't migrated yet. When neither exists (any non-WebMCP
 * browser) every method below is a safe no-op so the app still runs normally.
 */
import type { ToolSpec } from "@shared/contract";

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: ToolSpec["inputSchema"];
  execute: (input: unknown, ctx: { signal: AbortSignal }) => Promise<string>;
}

interface ModelContextLike {
  registerTool: (tool: ModelContextTool, opts: { signal: AbortSignal }) => Promise<void>;
  addEventListener?: (type: "toolchange", handler: () => void) => void;
  getTools?: () => ModelContextTool[];
  executeTool?: (tool: ModelContextTool, json: string, opts: { signal: AbortSignal }) => Promise<string>;
}

/** Whether this browser exposes WebMCP at all. */
export function isWebMcpAvailable(): boolean {
  return getModelContext() !== null;
}

function getModelContext(): ModelContextLike | null {
  if (typeof document !== "undefined") {
    const ctx = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
    if (ctx) return ctx;
  }
  if (typeof navigator !== "undefined") {
    const ctx = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
    if (ctx) return ctx;
  }
  return null;
}

interface Registered {
  spec: ToolSpec;
  controller: AbortController;
}

export type Executor = (spec: ToolSpec, input: unknown) => Promise<string>;

export class Registrar {
  private registered = new Map<string, Registered>();
  private listeners = new Set<() => void>();

  private emit(): void {
    for (const l of this.listeners) l();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getRegistered(): ToolSpec[] {
    return [...this.registered.values()].map((r) => r.spec);
  }

  /** Diff `specs` against what's live and register/unregister/re-register the delta. */
  async sync(specs: ToolSpec[], execute: Executor): Promise<void> {
    const mc = getModelContext();
    const nextByName = new Map<string, ToolSpec>(specs.map((s) => [s.name, s]));

    // removed or changed → abort
    for (const [name, entry] of this.registered) {
      const next = nextByName.get(name);
      if (!next || JSON.stringify(next.inputSchema) !== JSON.stringify(entry.spec.inputSchema)) {
        entry.controller.abort();
        this.registered.delete(name);
      }
    }

    // added or changed → register fresh
    for (const spec of specs) {
      if (this.registered.has(spec.name)) continue;
      const controller = new AbortController();
      if (mc) {
        await mc.registerTool(
          {
            name: spec.name,
            description: spec.description,
            inputSchema: spec.inputSchema,
            execute: (input) => execute(spec, input),
          },
          { signal: controller.signal },
        );
      }
      this.registered.set(spec.name, { spec, controller });
    }

    this.emit();
  }
}

export const registrar = new Registrar();
