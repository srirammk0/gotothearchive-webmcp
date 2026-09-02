import { test, expect } from "bun:test";
import { signedBlobUrl, verifyBlobSignature } from "./blob-sign";

const SECRET = "test-secret";

test("no secret configured -> signedBlobUrl returns null, feature no-ops", async () => {
  expect(await signedBlobUrl(undefined, "https://app.example", "/api/blob", "s/key1")).toBeNull();
});

test("a signed URL round-trips through verifyBlobSignature", async () => {
  const url = await signedBlobUrl(SECRET, "https://app.example", "/api/blob", "s/key1");
  expect(url).not.toBeNull();
  const parsed = new URL(url!);
  expect(parsed.origin).toBe("https://app.example");
  expect(parsed.pathname).toBe("/api/blob");
  const ok = await verifyBlobSignature(
    SECRET,
    parsed.searchParams.get("key")!,
    parsed.searchParams.get("exp"),
    parsed.searchParams.get("sig"),
  );
  expect(ok).toBe(true);
});

test("verifying with the wrong secret fails", async () => {
  const url = await signedBlobUrl(SECRET, "https://app.example", "/api/blob", "s/key1");
  const parsed = new URL(url!);
  const ok = await verifyBlobSignature(
    "a-different-secret",
    parsed.searchParams.get("key")!,
    parsed.searchParams.get("exp"),
    parsed.searchParams.get("sig"),
  );
  expect(ok).toBe(false);
});

test("a tampered key fails against the original signature", async () => {
  const url = await signedBlobUrl(SECRET, "https://app.example", "/api/blob", "s/key1");
  const parsed = new URL(url!);
  const ok = await verifyBlobSignature(
    SECRET,
    "s/key2", // someone else's key, same sig/exp
    parsed.searchParams.get("exp"),
    parsed.searchParams.get("sig"),
  );
  expect(ok).toBe(false);
});

test("an expired signature fails even though it was valid when minted", async () => {
  const url = await signedBlobUrl(SECRET, "https://app.example", "/api/blob", "s/key1", -1);
  const parsed = new URL(url!);
  const ok = await verifyBlobSignature(
    SECRET,
    parsed.searchParams.get("key")!,
    parsed.searchParams.get("exp"),
    parsed.searchParams.get("sig"),
  );
  expect(ok).toBe(false);
});

test("missing sig/exp params fail closed", async () => {
  expect(await verifyBlobSignature(SECRET, "s/key1", null, "somesig")).toBe(false);
  expect(await verifyBlobSignature(SECRET, "s/key1", "9999999999999", null)).toBe(false);
});

test("no secret configured -> verifyBlobSignature always fails, never accepts an unsigned request", async () => {
  expect(await verifyBlobSignature(undefined, "s/key1", "9999999999999", "anything")).toBe(false);
});
