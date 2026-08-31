import { DurableObject } from "cloudflare:workers";
import schema from "./db/schema.sql";
import { Queries } from "./db/queries";
import { migrate } from "./db/migrate";
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
  }

  async fetch(request: Request): Promise<Response> {
    return handleRoute(request, this.env, this.queries);
  }
}
