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
  title?: string;
  annotations?: ToolSpec["annotations"];
  inputSchema: ToolSpec["inputSchema"];
  execute: (
    input: unknown,
    ctx?: { signal?: AbortSignal },
  ) => Promise<string>;
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
  execute: Executor;
}

export type Executor = (spec: ToolSpec, input: unknown, signal?: AbortSignal) => Promise<string>;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fields that change what an agent sees or what the Lens reports. */
function sameMaterialSpec(a: ToolSpec, b: ToolSpec): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.why === b.why &&
    sameJson(a.annotations, b.annotations) &&
    sameJson(a.inputSchema, b.inputSchema)
  );
}

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
  private subscribed = false;

  async sync(specs: ToolSpec[], execute: Executor): Promise<void> {
    const mc = getModelContext();

    // Chrome fires `toolchange` on the model-context object whenever the live
    // tool set shifts (including changes we didn't make). Subscribe once.
    if (mc?.addEventListener && !this.subscribed) {
      this.subscribed = true;
      mc.addEventListener("toolchange", () => this.emit());
    }
    const nextByName = new Map<string, ToolSpec>(specs.map((s) => [s.name, s]));

    // Removed or materially changed tools must be unregistered. Aborting the
    // registration signal is the WebMCP unregister operation; it also makes
    // any in-flight registration or browser-side work cancellable.
    for (const [name, entry] of this.registered) {
      const next = nextByName.get(name);
      if (!next || !sameMaterialSpec(next, entry.spec)) {
        entry.controller.abort();
        this.registered.delete(name);
      } else {
        // Keep non-material state and the executor current without churning an
        // otherwise identical browser registration.
        entry.spec = next;
        entry.execute = execute;
      }
    }

    // added or changed → register fresh
    for (const spec of specs) {
      if (this.registered.has(spec.name)) continue;
      const controller = new AbortController();
      const entry: Registered = { spec, controller, execute };
      if (mc) {
        await mc.registerTool(
          {
            name: spec.name,
            description: spec.description,
            title: spec.title,
            annotations: spec.annotations,
            inputSchema: spec.inputSchema,
            execute: async (input, ctx) => {
              const current = this.registered.get(spec.name);
              if (!current) {
                return `Unknown tool "${spec.name}". It is not currently registered.`;
              }
              return current.execute(current.spec, input, ctx?.signal);
            },
          },
          { signal: controller.signal },
        );
      }
      this.registered.set(spec.name, entry);
    }

    this.emit();
  }
}

export const registrar = new Registrar();
