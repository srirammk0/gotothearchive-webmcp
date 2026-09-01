import { DurableObject } from "cloudflare:workers";
import schema from "./db/schema.sql";
import { Queries } from "./db/queries";
import { migrate, rebuildFts } from "./db/migrate";
import { rebuildSpaceEdges } from "./graph-build";
import { handleRoute } from "./routes";
import { drainSpaceMemory, memoryIndexFor } from "./memory-drain";

const GRAPH_DERIVATION_VERSION = 1;
/** Bump to force a one-time DROP + reindex of items_fts on the next boot. */
const FTS_REBUILD_VERSION = 1;
const MEMORY_DRAIN_DELAY_MS = 5_000;
const MEMORY_DRAIN_RETRY_MS = 30_000;

export class SpaceDO extends DurableObject<Env> {
  private queries: Queries;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.queries = new Queries(this.ctx.storage.sql, {
      mirrorMemory: Boolean(env.SUPERMEMORY_API_KEY?.trim()),
    });
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(schema);
      migrate(this.ctx.storage.sql);

      // items_fts: a full rebuild only when the version marker is stale (first
      // boot, or a deliberate bump). Per-write maintenance in queries.ts keeps
      // it correct otherwise, so this is not a per-boot cost.
      try {
        if (this.queries.ftsRebuildVersion() !== FTS_REBUILD_VERSION) {
          rebuildFts(this.ctx.storage.sql);
          this.queries.recordFtsRebuild(FTS_REBUILD_VERSION, Date.now());
        }
      } catch (e) {
        console.error("space-do: fts rebuild failed", e);
      }

      // Derived graph rules are versioned. A marker avoids repeated O(n²)
      // rescans while a version bump deliberately reruns derivation. The
      // backfill only inserts missing system edges; human-created edges remain.
      try {
        const now = Date.now();
        for (const space of this.queries.listSpaces()) {
          if (this.queries.graphBackfillVersion(space.id) === GRAPH_DERIVATION_VERSION) continue;
          rebuildSpaceEdges(this.queries, space.id, now);
          this.queries.recordGraphBackfill(space.id, GRAPH_DERIVATION_VERSION, now);
        }
      } catch (e) {
        console.error("space-do: graph backfill failed", e);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const response = await handleRoute(request, this.env, this.queries);
    // A write may have queued a memory_outbox row. Arm the drain alarm without
    // delaying the response, and only when the external index is configured.
    if (request.method !== "GET" && request.method !== "HEAD") {
      this.ctx.waitUntil(this.scheduleMemoryDrain());
    }
    return response;
  }

  /** SpaceDO.alarm(): drain one batch of memory_outbox, re-arm if work remains. */
  async alarm(): Promise<void> {
    const index = memoryIndexFor(this.env);
    if (!index) return;
    try {
      const { morePending } = await drainSpaceMemory(this.queries, index, [
        this.env.SUPERMEMORY_API_KEY ?? "",
      ]);
      if (morePending) await this.ctx.storage.setAlarm(Date.now() + MEMORY_DRAIN_RETRY_MS);
    } catch (e) {
      console.error("space-do: memory drain failed", e);
      await this.ctx.storage.setAlarm(Date.now() + MEMORY_DRAIN_RETRY_MS);
    }
  }

  private async scheduleMemoryDrain(): Promise<void> {
    try {
      if (!memoryIndexFor(this.env)) return;
      if (this.queries.countPendingMemoryOps() === 0) return;
      if ((await this.ctx.storage.getAlarm()) !== null) return;
      await this.ctx.storage.setAlarm(Date.now() + MEMORY_DRAIN_DELAY_MS);
    } catch (e) {
      console.error("space-do: could not arm memory drain", e);
    }
  }
}
