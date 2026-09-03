/**
 * Mint a signed `/demo` link for a hackathon judge.
 *
 *   BLOB_SIGNING_SECRET=... bun run scripts/demo-link.ts https://gotothearchive.example [ttlDays]
 *
 * Prints one URL. Anyone who opens it (and signs in through the normal Clerk
 * flow) lands in a fresh disposable guest space — see
 * docs/roadmap/judge-demo-access.md and docs/judges.md.
 */
import { signDemoToken } from "../worker/blob-sign";

const origin = Bun.argv[2];
const ttlDays = Number(Bun.argv[3] ?? "14");
const secret = Bun.env.BLOB_SIGNING_SECRET;

if (!origin || !secret) {
  console.error("usage: BLOB_SIGNING_SECRET=... bun run scripts/demo-link.ts <origin> [ttlDays]");
  process.exit(1);
}

const { exp, sig } = await signDemoToken(secret, ttlDays * 24 * 60 * 60 * 1000);
const url = new URL("/demo", origin);
url.searchParams.set("demo_exp", String(exp));
url.searchParams.set("demo_sig", sig);
console.log(url.toString());
console.log(`(valid until ${new Date(exp).toISOString()})`);
