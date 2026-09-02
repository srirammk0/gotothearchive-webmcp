import { DurableObject } from "cloudflare:workers";
import schema from "./db/schema.sql";
import { Queries } from "./db/queries";
import { migrate, rebuildFts } from "./db/migrate";
import { rebuildSpaceEdges } from "./graph-build";
import { handleRoute } from "./routes";
import { drainSpaceMemory, memoryIndexFor } from "./memory-drain";
import { captionSpaceImages } from "./vision";

const GRAPH_DERIVATION_VERSION = 1;
/** Bump to force a one-time DROP + reindex of items_fts on the next boot. */
const FTS_REBUILD_VERSION = 1;
const MEMORY_DRAIN_DELAY_MS = 5_000;
const MEMORY_DRAIN_RETRY_MS = 30_000;
const CAPTION_DRAIN_DELAY_MS = 5_000;
const CAPTION_DRAIN_RETRY_MS = 30_000;

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

      // Older captures spun extracted media / referenced links off as their own
      // items. They're now folded into the parent's metadata instead, so drop
      // the leftover cards. Self-clearing — the next boot finds none.
      try {
        for (const space of this.queries.listSpaces()) {
          this.queries.deleteExtractionChildren(space.id);
        }
      } catch (e) {
        console.error("space-do: extraction-child cleanup failed", e);
      }

      // Catch the external memory index up on anything not yet synced (captured
      // before the mirror, or before the API key was set). Idempotent; the
      // alarm below drains whatever this queues.
      try {
        const mirror = Boolean(env.SUPERMEMORY_API_KEY?.trim());
        let queued = 0;
        for (const space of this.queries.listSpaces()) {
          queued += this.queries.backfillMemoryOutbox(space.id);
        }
        console.log(`space-do: memory backfill — mirror=${mirror} queued=${queued}`);
        if (queued > 0) await this.ctx.storage.setAlarm(Date.now() + MEMORY_DRAIN_DELAY_MS);
      } catch (e) {
        console.error("space-do: memory backfill failed", e);
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

      // Images captured before auto-captioning existed (or where a caption call
      // previously failed) have no separate queue — imagesNeedingCaption's own
      // live query is the backlog. Just check whether it's non-empty and arm.
      try {
        for (const space of this.queries.listSpaces()) {
          if (this.queries.imagesNeedingCaption(space.id, 1).length > 0) {
            await this.ctx.storage.setAlarm(Date.now() + CAPTION_DRAIN_DELAY_MS);
            break;
          }
        }
      } catch (e) {
        console.error("space-do: caption backlog check failed", e);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const response = await handleRoute(request, this.env, this.queries);
    // A write may have queued a memory_outbox row, or added an uncaptioned
    // image. Arm the relevant drain alarm without delaying the response.
    if (request.method !== "GET" && request.method !== "HEAD") {
      this.ctx.waitUntil(this.scheduleMemoryDrain());
      this.ctx.waitUntil(this.scheduleCaptionDrain());
    }
    return response;
  }

  /** SpaceDO.alarm(): drain one batch each of memory_outbox and the caption backlog, re-arm if either has more. */
  async alarm(): Promise<void> {
    let morePending = false;

    const index = memoryIndexFor(this.env);
    if (index) {
      try {
        const { report, morePending: memoryMore } = await drainSpaceMemory(
          this.queries,
          index,
          [this.env.SUPERMEMORY_API_KEY ?? ""],
          async (key) => {
            const obj = await this.env.BLOBS.get(key);
            return obj?.body ? { body: obj.body, contentType: obj.httpMetadata?.contentType ?? null } : null;
          },
        );
        console.log(`space-do: memory drain — ${JSON.stringify(report)} morePending=${memoryMore}`);
        morePending ||= memoryMore;
      } catch (e) {
        console.error("space-do: memory drain failed", e);
        morePending = true;
      }
    }

    try {
      for (const space of this.queries.listSpaces()) {
        const { captioned, morePending: captionsMore } = await captionSpaceImages(
          this.queries,
          this.env,
          space.id,
          async (key) => {
            const obj = await this.env.BLOBS.get(key);
            return obj?.body ? new Uint8Array(await obj.arrayBuffer()) : null;
          },
        );
        if (captioned > 0) console.log(`space-do: captioned ${captioned} image(s) in ${space.id}`);
        morePending ||= captionsMore;
      }
    } catch (e) {
      console.error("space-do: caption drain failed", e);
      morePending = true;
    }

    if (morePending) await this.ctx.storage.setAlarm(Date.now() + Math.max(MEMORY_DRAIN_RETRY_MS, CAPTION_DRAIN_RETRY_MS));
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

  private async scheduleCaptionDrain(): Promise<void> {
    try {
      if ((await this.ctx.storage.getAlarm()) !== null) return;
      const backlog = this.queries.listSpaces().some((s) => this.queries.imagesNeedingCaption(s.id, 1).length > 0);
      if (!backlog) return;
      await this.ctx.storage.setAlarm(Date.now() + CAPTION_DRAIN_DELAY_MS);
    } catch (e) {
      console.error("space-do: could not arm caption drain", e);
    }
  }
}
