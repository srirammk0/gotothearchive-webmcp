import { API } from "@shared/contract";

export { SpaceDO } from "./space-do";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === API.health) {
      return Response.json({ ok: true, service: "gotothearchive-worker" });
    }

    if (url.pathname.startsWith("/api/")) {
      // Edge backstop, evaluated before the Durable Object is even woken, so a
      // flood or a runaway client loop can't drain the included DO-request
      // allowance through the unmetered read routes. The monthly beta quota
      // (worker/quota.ts) handles cost-shaped metering; this only caps burst
      // rate per caller. Fails open if the binding isn't configured.
      if (env.API_RL) {
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        const { success } = await env.API_RL.limit({ key: ip });
        if (!success) {
          return Response.json(
            { ok: false, error: "rate_limited", message: "Too many requests. Slow down and retry shortly." },
            { status: 429, headers: { "retry-after": "10" } },
          );
        }
      }

      // Named for the identity era, not the product: the guest-era instance
      // held spaces owned by cookie ids that no longer resolve to anyone.
      const id = env.SPACE.idFromName("clerk");
      return env.SPACE.get(id).fetch(request);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
