import { API } from "@shared/contract";

export { SpaceDO } from "./space-do";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === API.health) {
      return Response.json({ ok: true, service: "gotothearchive-worker" });
    }

    if (url.pathname.startsWith("/api/")) {
      const id = env.SPACE.idFromName("guest");
      return env.SPACE.get(id).fetch(request);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
