import { useEffect, useState, type ReactNode } from "react";
import type { ContextItem } from "@shared/contract";
import { blobUrl } from "../../api/client";
import { Icon } from "../primitives/Icon";
import { ArtifactThumb } from "../workbench/ArtifactThumb";
import { previewSandbox, previewSrcDoc } from "../workbench/componentPreview";
import { extractedImage, FileCard, host, kind, tweetId } from "./itemKind";
import { Tweet } from "./Tweet";

export type PreviewSize = "tile" | "thumb" | "chip";

/** A captured link leads with its extracted preview image; falls back to host + excerpt. */
function LinkPreview({ item }: { item: ContextItem }) {
  const [failed, setFailed] = useState(false);
  const img = extractedImage(item);
  const chip = host(item) ? (
    <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] bg-raised px-2 py-1 text-micro text-muted">
      <Icon name="arrowRight" size={12} />
      {host(item)}
    </span>
  ) : null;

  if (img && !failed) {
    return (
      <div className="flex h-full w-full flex-col gap-2">
        <img
          src={img}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="min-h-0 flex-1 rounded-[var(--radius-sm)] object-cover"
        />
        {chip}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 self-start">
      {chip}
      <p className="line-clamp-5 text-meta leading-relaxed text-muted">
        {item.semantic_text ?? item.title}
      </p>
    </div>
  );
}

/**
 * The Archive grid tile: full detail per type. Images and PDFs render their
 * real bytes (cached hard by the blob route); links lead with their host;
 * text items become a quiet excerpt so a wall of notes never reads as a wall
 * of empty boxes.
 */
function TilePreview({ item }: { item: ContextItem }) {
  const { render } = kind(item);

  if (render === "image" && item.content_ref) {
    return (
      <img
        src={blobUrl(item.content_ref)}
        alt=""
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
      />
    );
  }
  if (render === "pdf" && item.content_ref) {
    return (
      <iframe
        title={item.title}
        src={`${blobUrl(item.content_ref)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full bg-white"
      />
    );
  }
  if (render === "text" && item.content_ref) {
    return (
      <iframe
        title={item.title}
        src={blobUrl(item.content_ref)}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full bg-white text-black"
      />
    );
  }
  if (render === "artifact") {
    return (
      <ArtifactThumb
        html={String(item.metadata?.preview_html ?? "")}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    );
  }
  if (render === "office") return <FileCard item={item} />;
  if (render === "tweet") {
    const tw = tweetId(item.source_url);
    return (
      <div className="pointer-events-none absolute inset-0 flex justify-center overflow-hidden">
        {tw ? <Tweet id={tw} className="max-w-full" /> : null}
      </div>
    );
  }
  if (render === "link") return <LinkPreview item={item} />;
  return (
    <p className="line-clamp-6 self-start text-meta leading-relaxed text-muted">
      {item.semantic_text ?? item.title}
    </p>
  );
}

/** A ~64px evidence/reference thumbnail: image, a scaled tweet embed, a file card, or a text excerpt. */
function ThumbPreview({ item }: { item: ContextItem }) {
  const { render } = kind(item);
  if (render === "image" && item.content_ref) {
    return <img src={blobUrl(item.content_ref)} alt="" className="h-full w-full object-cover" />;
  }
  const tw = render === "tweet" ? tweetId(item.source_url) : null;
  if (tw) return <Tweet id={tw} className="scale-90" />;
  if (render === "office" || render === "pdf") return <FileCard item={item} />;
  return (
    <p className="line-clamp-4 p-2 text-micro leading-relaxed text-muted">
      {item.semantic_text ?? item.title}
    </p>
  );
}

/**
 * A ~24-32px icon-scale chip: too small for an embed or a labelled file card,
 * so everything but an image falls back to one type-matched glyph.
 */
function ChipPreview({ item }: { item: ContextItem }) {
  const { render } = kind(item);
  if (render === "image" && item.content_ref) {
    return <img src={blobUrl(item.content_ref)} alt="" className="h-full w-full object-cover" />;
  }
  const glyph = render === "tweet" || render === "link" ? "link" : "file";
  return <Icon name={glyph} size={14} className="text-faint" />;
}

/**
 * One item, rendered per its kind() at the given scale. `tile` is the Archive
 * grid cell; `thumb` is a ~64px evidence/reference card (Taste, provenance);
 * `chip` is a ~24-32px inline icon (ConnectionsPanel links).
 */
export function ItemPreview({ item, size }: { item: ContextItem; size: PreviewSize }) {
  if (size === "tile") return <TilePreview item={item} />;
  if (size === "thumb") return <ThumbPreview item={item} />;
  return <ChipPreview item={item} />;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

/**
 * The artifact branch of detailPreview(), split out because it needs its own
 * zoom state (a hook) — unlike ArtifactThumb (a fixed-scale, pointer-events-
 * none *thumbnail*, correctly used at tile size), this is the full-size,
 * genuinely interactive artifact: the same sandboxed srcDoc as
 * ArtifactViewer, at natural size, with a scroll/pinch (ctrl+wheel) +
 * click zoom the way an image viewer would.
 */
function ArtifactDetailPreview({ item }: { item: ContextItem }) {
  const html = String(item.metadata?.preview_html ?? "");
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [item.id]);

  if (!html) {
    return (
      <div className="flex h-full w-full items-center justify-center text-micro text-faint">No preview</div>
    );
  }

  const zoomBy = (delta: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)));

  return (
    <div
      className="relative h-full w-full overflow-auto rounded-[var(--radius-sm)] border border-line-soft bg-white"
      onWheel={(e) => {
        // Trackpad pinch and ctrl+scroll both fire as a wheel event with ctrlKey —
        // a plain scroll should still pan the zoomed content, not zoom it.
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomBy(e.deltaY * -0.01);
      }}
    >
      <iframe
        title="Artifact preview"
        srcDoc={previewSrcDoc(html)}
        sandbox={previewSandbox(html)}
        referrerPolicy="no-referrer"
        className="h-full w-full origin-top-left"
        style={{ transform: `scale(${zoom})` }}
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-raised/90 p-0.5 text-meta text-muted backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(-ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] hover:bg-hover hover:text-text disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="Reset zoom"
          className="min-w-[3ch] px-1 text-center text-micro tabular-nums hover:text-text"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] hover:bg-hover hover:text-text disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * The full-detail render shared by CapturePreview and ItemLightbox: the six
 * kinds whose full-size treatment is identical in both (an embed or the real
 * bytes, filling the pane). A plain function, not a component — so a caller
 * can fall through to its own bespoke JSX (an editable note, a clickable
 * link image, a host-line fallback) with `detailPreview(item) ?? <Own />`,
 * which a component's always-something JSX return can't express.
 *
 * Returns null for every kind these two callers still hand-render
 * themselves: `note` (only ItemLightbox's is editable), `link` (each wraps
 * its extracted-image fallback differently), and the terminal fallback
 * (each caller's differs — a host chip vs a clickable source link).
 */
export function detailPreview(item: ContextItem): ReactNode | null {
  const { render } = kind(item);

  if (render === "image" && item.content_ref) {
    return <img src={blobUrl(item.content_ref)} alt="" className="max-h-full max-w-full object-contain" />;
  }
  if (render === "pdf" && item.content_ref) {
    return (
      <iframe
        title={item.title}
        src={`${blobUrl(item.content_ref)}#view=FitH`}
        className="h-full w-full rounded-[var(--radius-sm)] bg-white"
      />
    );
  }
  if (render === "text" && item.content_ref) {
    return (
      <iframe title={item.title} src={blobUrl(item.content_ref)} className="h-full w-full rounded-[var(--radius-sm)] bg-white" />
    );
  }
  if (render === "artifact") return <ArtifactDetailPreview item={item} />;
  if (render === "office") return <FileCard item={item} big />;
  if (render === "tweet") {
    const tw = tweetId(item.source_url);
    if (tw) {
      return (
        <div className="no-scrollbar h-full w-full max-w-[550px] overflow-y-auto">
          <Tweet id={tw} />
        </div>
      );
    }
  }
  return null;
}
