import { DurableObject } from "cloudflare:workers";
import schema from "./db/schema.sql";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
import { rebuildSpaceEdges } from "./graph-build";
import { handleRoute } from "./routes";

export class SpaceDO extends DurableObject<Env> {
  private queries: Queries;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(schema);
      migrate(this.ctx.storage.sql);
    });
    this.queries = new Queries(this.ctx.storage.sql);

    // Backfill derived graph edges for spaces that predate graph-build. Every
    // rule is edgeExists-gated so this is idempotent; skipped once a space
    // already has more edges than items. Never blocks boot.
    // ponytail: O(n^2) over a space's items on the boot it first runs; a
    // one-shot marker would avoid the re-scan if boots get frequent.
    try {
      const now = Date.now();
      for (const space of this.queries.listSpaces()) {
        const items = this.queries.listItemsBySpace(space.id);
        if (items.length === 0) continue;
        const edges = this.queries.listEdgesForItems(items.map((i) => i.id)).length;
        if (edges < items.length) rebuildSpaceEdges(this.queries, space.id, now);
      }
    } catch (e) {
      console.error("space-do: graph backfill failed", e);
    }
  }

  async fetch(request: Request): Promise<Response> {
    return handleRoute(request, this.env, this.queries);
  }
}
