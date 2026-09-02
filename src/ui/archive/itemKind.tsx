import type { ContextItem } from "@shared/contract";
import { Icon } from "../primitives/Icon";

export function tweetId(url: string | null): string | null {
  if (!url) return null;
  const m = /(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/.exec(url);
  return m ? m[1] : null;
}

/** The first image the extractor pulled from a captured link (og:image, tweet media). */
export function extractedImage(item: ContextItem): string | null {
  const ex = (item.metadata as { extracted?: { images?: unknown } }).extracted;
  const imgs = ex && Array.isArray(ex.images) ? ex.images : [];
  return typeof imgs[0] === "string" && /^https?:\/\//i.test(imgs[0]) ? imgs[0] : null;
}

/** The item's source hostname, stripped of a leading www. */
export function host(item: ContextItem): string | null {
  return item.source_url ? new URL(item.source_url).hostname.replace(/^www\./, "") : null;
}

/** The file extension carried by an item's title or source URL, lowercased. */
export function ext(item: ContextItem): string {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(item.title || item.source_url || "");
  return m ? m[1].toLowerCase() : "";
}

export type Renderable = "image" | "pdf" | "text" | "office" | "tweet" | "link" | "note" | "artifact";

/** How a given item should be shown, and what to call its type. */
export function kind(item: ContextItem): { label: string; render: Renderable } {
  if (item.metadata?.artifact_id) return { label: "Artifact", render: "artifact" };
  if (item.type === "image" || item.type === "screenshot") return { label: "Image", render: "image" };
  if (item.type === "note") return { label: "Note", render: "note" };
  if (item.type === "link") return { label: "Link", render: tweetId(item.source_url) ? "tweet" : "link" };
  const e = ext(item);
  if (item.type === "pdf" || e === "pdf") return { label: "PDF", render: "pdf" };
  switch (e) {
    case "doc":
    case "docx":
      return { label: "Word", render: "office" };
    case "ppt":
    case "pptx":
    case "key":
      return { label: "Slides", render: "office" };
    case "xls":
    case "xlsx":
    case "numbers":
      return { label: "Spreadsheet", render: "office" };
    case "csv":
      return { label: "CSV", render: "text" };
    case "md":
    case "markdown":
      return { label: "Markdown", render: "text" };
    case "txt":
    case "rtf":
      return { label: "Text", render: "text" };
    default:
      return { label: "Document", render: item.content_ref ? "text" : "note" };
  }
}

/** A quiet placeholder for a file we can't render inline (Office docs, etc.). */
export function FileCard({ item, big = false }: { item: ContextItem; big?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-faint">
      <Icon name="file" size={big ? 44 : 28} />
      <p
        className={`max-w-[80%] truncate text-center ${
          big ? "text-meta" : "text-micro"
        }`}
      >
        {item.title}
      </p>
      <span className="rounded-[var(--radius-sm)] bg-hover px-1.5 py-px text-micro text-muted">
        {kind(item).label}
      </span>
    </div>
  );
}
