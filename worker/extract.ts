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
const MAX_REDIRECTS = 3;

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
  ".nip.io",
  ".sslip.io",
  ".xip.io",
  ".localtest.me",
  ".lvh.me",
];

function ipv4Parts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  return values.every((part) => part >= 0 && part <= 255) ? values : null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = ipv4Parts(host);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function ipv6Bytes(host: string): number[] | null {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return null;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (!part) return [];
    const groups = part.split(":");
    const out: number[] = [];
    for (const group of groups) {
      if (group.includes(".")) {
        const ipv4 = ipv4Parts(group);
        if (!ipv4) return null;
        out.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(group)) {
        out.push(Number.parseInt(group, 16));
      } else {
        return null;
      }
    }
    return out;
  };
  const left = parse(halves[0]);
  const right = parse(halves[1] ?? "");
  if (!left || !right) return null;
  if (left.length + right.length > 8 || (halves.length === 1 && left.length !== 8)) return null;
  const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : [...left];
  return groups.length === 8 ? groups : null;
}

function isPrivateIpv6(host: string): boolean {
  const groups = ipv6Bytes(host);
  if (!groups) return false;
  const isZero = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const isMulticast = (groups[0] & 0xff00) === 0xff00;
  const isDocumentation = groups[0] === 0x2001 && groups[1] === 0x0db8;
  const isV4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const mappedV4 = isV4Mapped ? `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}` : "";
  return isZero || isLoopback || isUniqueLocal || isLinkLocal || isMulticast || isDocumentation || isPrivateIpv4(mappedV4);
}

/** Accept only public http(s) URLs; DNS names are syntactically public hosts. */
export function isPublicHttpUrl(input: string | URL): boolean {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : input;
  } catch {
    return false;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  return !isPrivateIpv4(host) && !isPrivateIpv6(host);
}

function absolutize(href: unknown, base: string): string | null {
  if (typeof href !== "string" || !href.trim()) return null;
  try {
    const url = new URL(href, base);
    return isPublicHttpUrl(url) ? url.toString() : null;
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
  const rawText = typeof t.text === "string" ? t.text : null;
  // display_text_range marks the human-authored span; anything after it is the
  // auto-appended media/quote t.co link, which is noise in semantic_text.
  const range = Array.isArray(t.display_text_range) ? t.display_text_range : null;
  const end = range && typeof range[1] === "number" ? range[1] : null;
  const text = rawText && end !== null ? rawText.slice(0, end).trim() || rawText : rawText;
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

async function fetchText(
  url: string,
  headers: Record<string, string>,
  wantHtml: boolean,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    let current = url;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      if (!isPublicHttpUrl(current)) return null;
      const res = await fetchImpl(current, { headers, signal: ctrl.signal, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (redirectCount === MAX_REDIRECTS) return null;
        const location = res.headers.get("location");
        const next = location ? absolutize(location, current) : null;
        if (!next) return null;
        current = next;
        continue;
      }
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
          const remaining = BODY_CAP - total;
          const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
          chunks.push(chunk);
          total += chunk.byteLength;
          if (total >= BODY_CAP) {
            await reader.cancel();
            break;
          }
        }
      }
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.byteLength;
      }
      return new TextDecoder().decode(buf);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<ExtractResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isPublicHttpUrl(parsed)) return null;

  const tweet = TWEET_RE.exec(url);
  if (tweet) {
    const id = tweet[1];
    const synUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=a`;
    const body = await fetchText(synUrl, { "User-Agent": UA, Accept: "application/json" }, false, fetchImpl);
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
      fetchImpl,
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

  const html = await fetchText(url, { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, true, fetchImpl);
  if (!html) return null;
  return parsePageHtml(html, url);
}
