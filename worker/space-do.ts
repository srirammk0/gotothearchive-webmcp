import { DurableObject } from "cloudflare:workers";
import schema from "./db/schema.sql";
import { Queries } from "./db/queries";
import { migrate, rebuildFts } from "./db/migrate";
import { GRAPH_DERIVATION_VERSION, rebuildSpaceEdges } from "./graph-build";
import { handleRoute } from "./routes";
import { backfillSpaceDesign } from "./design";

/** Bump to force a one-time DROP + reindex of items_fts on the next boot. */
const FTS_REBUILD_VERSION = 1;
const DESIGN_DRAIN_DELAY_MS = 5_000;
const DESIGN_DRAIN_RETRY_MS = 30_000;

export class SpaceDO extends DurableObject<Env> {
  private queries: Queries;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.queries = new Queries(this.ctx.storage.sql);
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

      // Images archived before design extraction existed (or where a previous
      // extraction failed) have no separate queue — imagesNeedingDesign's own
      // live query IS the backlog. Just check whether it is non-empty and arm.
      try {
        for (const space of this.queries.listSpaces()) {
          if (this.queries.imagesNeedingDesign(space.id, 1).length > 0) {
            await this.ctx.storage.setAlarm(Date.now() + DESIGN_DRAIN_DELAY_MS);
            break;
          }
        }
      } catch (e) {
        console.error("space-do: design backlog check failed", e);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const response = await handleRoute(request, this.env, this.queries);
    // A write may have added an uncaptioned image. Arm the drain alarm
    // without delaying the response.
    if (request.method !== "GET" && request.method !== "HEAD") {
      this.ctx.waitUntil(this.scheduleDesignDrain());
    }
    return response;
  }

  /** SpaceDO.alarm(): drain the caption backlog, re-arm if there's more. */
  async alarm(): Promise<void> {
    let morePending = false;

    try {
      for (const space of this.queries.listSpaces()) {
        const { extracted, morePending: designMore } = await backfillSpaceDesign(
          this.queries,
          space.owner_id,
          this.env,
          space.id,
          async (key) => {
            const obj = await this.env.BLOBS.get(key);
            return obj?.body ? new Uint8Array(await obj.arrayBuffer()) : null;
          },
        );
        if (extracted > 0) {
          console.log(`space-do: extracted design for ${extracted} image(s) in ${space.id}`);
        }
        morePending ||= designMore;
      }
    } catch (e) {
      console.error("space-do: design backfill failed", e);
      morePending = true;
    }

    if (morePending) await this.ctx.storage.setAlarm(Date.now() + DESIGN_DRAIN_RETRY_MS);
  }

  private async scheduleDesignDrain(): Promise<void> {
    try {
      if ((await this.ctx.storage.getAlarm()) !== null) return;
      const backlog = this.queries.listSpaces().some((s) => this.queries.imagesNeedingDesign(s.id, 1).length > 0);
      if (!backlog) return;
      await this.ctx.storage.setAlarm(Date.now() + DESIGN_DRAIN_DELAY_MS);
    } catch (e) {
      console.error("space-do: could not arm design drain", e);
    }
  }
}
