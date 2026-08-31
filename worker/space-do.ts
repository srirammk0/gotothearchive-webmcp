import { DurableObject } from "cloudflare:workers";
import schema from "./db/schema.sql";

export class SpaceDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(schema);
    });
  }

  async fetch(_request: Request): Promise<Response> {
    return Response.json({ ok: true, note: "SpaceDO reachable" });
  }
}
