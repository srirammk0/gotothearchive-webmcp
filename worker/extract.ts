// ponytail: regex HTML parsing here is deliberately minimal — og: meta tags and
// <title> only, no DOM. If extraction ever needs to get richer (body text,
// article boilerplate stripping, multiple images), switch to Cloudflare's
// HTMLRewriter or a real parser rather than growing these regexes.

export interface ExtractResult {
  title: string | null;
  text: string | null;
  author: string | null;
  images: string[];
  links: string[];
  kind: "tweet" | "page";
}

const TWEET_RE = /(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/;
const IMG_CAP = 8;
const LINK_CAP = 12;
const BODY_CAP = 512 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function absolutize(href: unknown, base: string): string | null {
  if (typeof href !== "string" || !href.trim()) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function dedupeCap(urls: (string | null)[], cap: number): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= cap) break;
  }
  return out;
}

function isSelfLink(u: string): boolean {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return h === "t.co" || h === "twitter.com" || h === "x.com";
  } catch {
    return true;
  }
}

/** Pure: map a cdn.syndication.twimg.com tweet-result payload to ExtractResult. */
export function parseTweetResult(json: unknown): ExtractResult {
  const t = (json ?? {}) as Record<string, unknown>;
  const text = typeof t.text === "string" ? t.text : null;
  const user = (t.user ?? {}) as Record<string, unknown>;
  const author = typeof user.screen_name === "string" ? user.screen_name : null;

  const imgs: (string | null)[] = [];
  for (const p of Array.isArray(t.photos) ? t.photos : []) {
    if (p && typeof p === "object") imgs.push(absolutize((p as Record<string, unknown>).url, "https://twitter.com"));
  }
  for (const m of Array.isArray(t.mediaDetails) ? t.mediaDetails : []) {
    if (m && typeof m === "object") {
      const md = m as Record<string, unknown>;
      imgs.push(absolutize(md.media_url_https ?? md.media_url, "https://twitter.com"));
    }
  }

  const entities = (t.entities ?? {}) as Record<string, unknown>;
  const links: (string | null)[] = [];
  for (const e of Array.isArray(entities.urls) ? entities.urls : []) {
    if (e && typeof e === "object") {
      const abs = absolutize((e as Record<string, unknown>).expanded_url, "https://twitter.com");
      if (abs && !isSelfLink(abs)) links.push(abs);
    }
  }

  const firstLine = text ? text.split("\n")[0].trim() : "";
  const title = (firstLine || text || "").slice(0, 80).trim() || null;

  return {
    title,
    text,
    author,
    images: dedupeCap(imgs, IMG_CAP),
    links: dedupeCap(links, LINK_CAP),
    kind: "tweet",
  };
}

function metaContent(html: string, key: string): string | null {
  // Tolerant of attribute order and single/double quotes.
  const attr = `(?:property|name)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`;
  const re = new RegExp(
    `<meta[^>]*(?:${attr}[^>]*content\\s*=\\s*["']([^"']*)["']|content\\s*=\\s*["']([^"']*)["'][^>]*${attr})`,
    "i",
  );
  const m = re.exec(html);
  const raw = m ? m[1] ?? m[2] : null;
  return raw ? decodeEntities(raw).trim() || null : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

/** Pure: pull title/description/image from raw HTML for a non-tweet page. */
export function parsePageHtml(html: string, baseUrl: string): ExtractResult {
  const ogTitle = metaContent(html, "og:title");
  let title = ogTitle;
  if (!title) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    title = m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() || null : null;
  }
  const text = metaContent(html, "og:description") ?? metaContent(html, "description");
  const ogSite = metaContent(html, "og:site_name");
  const ogImage = metaContent(html, "og:image");

  return {
    title,
    text,
    author: ogSite,
    images: dedupeCap([absolutize(ogImage, baseUrl)], IMG_CAP),
    links: [],
    kind: "page",
  };
}

async function fetchText(url: string, headers: Record<string, string>, wantHtml: boolean): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok || !res.body) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (wantHtml && !/text\/html|application\/xhtml/i.test(ct)) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= BODY_CAP) {
          await reader.cancel();
          break;
        }
      }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.byteLength, buf.byteLength - off)), off);
      off += c.byteLength;
    }
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractUrl(url: string): Promise<ExtractResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const tweet = TWEET_RE.exec(url);
  if (tweet) {
    const id = tweet[1];
    const synUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=a`;
    const body = await fetchText(synUrl, { "User-Agent": UA, Accept: "application/json" }, false);
    if (body) {
      try {
        const result = parseTweetResult(JSON.parse(body));
        if (result.text || result.title) return result;
      } catch {
        // fall through to oEmbed
      }
    }
    // Fallback: oEmbed, strip HTML to text.
    const oe = await fetchText(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&dnt=true&omit_script=true`,
      { "User-Agent": UA, Accept: "application/json" },
      false,
    );
    if (!oe) return null;
    try {
      const data = JSON.parse(oe) as Record<string, unknown>;
      const rawHtml = typeof data.html === "string" ? data.html : "";
      const stripped = decodeEntities(rawHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const author = typeof data.author_name === "string" ? data.author_name : null;
      if (!stripped) return null;
      return {
        title: stripped.slice(0, 80).trim() || null,
        text: stripped,
        author,
        images: [],
        links: [],
        kind: "tweet",
      };
    } catch {
      return null;
    }
  }

  const html = await fetchText(url, { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, true);
  if (!html) return null;
  return parsePageHtml(html, url);
}
