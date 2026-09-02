// Minimal shims so `bunx tsc -p tsconfig.worker.json` (no bun/node types) stays green;
// `bun test` supplies the real `test` at runtime.
declare const test: (name: string, fn: () => void | Promise<void>) => void;
import { parsePageHtml, parseTweetResult } from "./extract";

function eq(a: unknown, b: unknown, msg?: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg ?? "assertion failed"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  }
}
const assert = { equal: eq, deepEqual: eq };

const SAMPLE_TWEET = {
  text: "Shipping the new archive extractor today.\nMore soon.",
  user: { screen_name: "sriram" },
  photos: [{ url: "https://pbs.twimg.com/media/abc.jpg" }],
  mediaDetails: [{ media_url_https: "https://pbs.twimg.com/media/abc.jpg" }],
  entities: {
    urls: [
      { expanded_url: "https://example.com/post" },
      { expanded_url: "https://t.co/xxxx" },
      { expanded_url: "https://twitter.com/sriram/status/1" },
    ],
  },
};

test("parseTweetResult maps fields, dedupes images, drops self-links", () => {
  const r = parseTweetResult(SAMPLE_TWEET);
  assert.equal(r.kind, "tweet");
  assert.equal(r.author, "sriram");
  assert.equal(r.text, SAMPLE_TWEET.text);
  assert.equal(r.title, "Shipping the new archive extractor today.");
  assert.deepEqual(r.images, ["https://pbs.twimg.com/media/abc.jpg"]);
  assert.deepEqual(r.links, ["https://example.com/post"]);
});

test("parseTweetResult trims the auto-appended media link via display_text_range", () => {
  const r = parseTweetResult({
    text: "The design vs The image https://t.co/QPou8ubm07",
    display_text_range: [0, 23],
    user: { screen_name: "Palakonweb" },
    mediaDetails: [{ media_url_https: "https://pbs.twimg.com/media/HQNrjNeaUAAOkNY.jpg" }],
    entities: { urls: [] },
  });
  assert.equal(r.text, "The design vs The image");
  assert.equal(r.title, "The design vs The image");
  assert.deepEqual(r.images, ["https://pbs.twimg.com/media/HQNrjNeaUAAOkNY.jpg"]);
});

test("parseTweetResult tolerates junk", () => {
  const r = parseTweetResult(null);
  assert.equal(r.text, null);
  assert.equal(r.title, null);
  assert.deepEqual(r.images, []);
});

const SAMPLE_HTML = `
<html><head>
<title>Fallback Title &amp; Co</title>
<meta content='OG Title' property="og:title">
<meta name='description' content="A short description.">
<meta property="og:image" content="/img/hero.png">
<meta property="og:site_name" content="Example">
</head><body>ignored</body></html>`;

test("parsePageHtml prefers og:title, absolutizes image", () => {
  const r = parsePageHtml(SAMPLE_HTML, "https://example.com/a/b");
  assert.equal(r.kind, "page");
  assert.equal(r.title, "OG Title");
  assert.equal(r.text, "A short description.");
  assert.equal(r.author, "Example");
  assert.deepEqual(r.images, ["https://example.com/img/hero.png"]);
  assert.deepEqual(r.links, []);
});

test("parsePageHtml falls back to <title>", () => {
  const r = parsePageHtml("<title>Only Title</title>", "https://example.com/");
  assert.equal(r.title, "Only Title");
});
