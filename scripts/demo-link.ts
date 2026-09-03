/**
 * Mint a signed, time-limited `/api/demo-entry` link for a hackathon judge.
 *
 *   BLOB_SIGNING_SECRET=... bun run scripts/demo-link.ts https://gotothearchive.example [ttlDays]
 *
 * Prints one URL. Opening it sets a 24h `demo_session` cookie and drops the
 * visitor straight into the ONE shared demo archive — see
 * docs/roadmap/judge-demo-access.md and docs/judges.md. The `?token=` it carries
 * only gates *entry* and expires after `ttlDays` (default 14); the session it
 * mints is independent and always 24h.
 *
 * The bare `${origin}/api/demo-entry` (no token) also works — it is linked under
 * the sign-in form — so this script is only needed when you want the entry point
 * itself to expire.
 */
import { signDemoLink } from "../worker/blob-sign";

const origin = Bun.argv[2];
const ttlDays = Number(Bun.argv[3] ?? "14");
const secret = Bun.env.BLOB_SIGNING_SECRET;

if (!origin || !secret) {
  console.error("usage: BLOB_SIGNING_SECRET=... bun run scripts/demo-link.ts <origin> [ttlDays]");
  process.exit(1);
}

const { exp, sig } = await signDemoLink(secret, ttlDays * 24 * 60 * 60 * 1000);
const url = new URL("/api/demo-entry", origin);
url.searchParams.set("token", `${exp}.${sig}`);
console.log(url.toString());
console.log(`(valid until ${new Date(exp).toISOString()})`);
