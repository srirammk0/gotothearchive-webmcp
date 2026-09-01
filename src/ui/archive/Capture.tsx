import { useRef, useState } from "react";
import type { ContextItem, ItemType, Region } from "@shared/contract";
import { createItem, uploadBlob } from "../../api/client";
import { Button } from "../primitives/Button";
import { Spinner } from "../primitives/Spinner";
import { Icon } from "../primitives/Icon";

export interface CaptureProps {
  /** The folder everything captured here lands in. */
  region: Region;
  onCaptured: (item: ContextItem) => void;
}

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

function typeForFile(file: File): ItemType {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "document";
}

function isLink(text: string): boolean {
  try {
    return !!new URL(text.trim());
  } catch {
    return false;
  }
}

/**
 * One universal box: type a note, paste a link, or drop / paste images and
 * PDFs. Whatever it is, it lands in `region`.
 */
export function Capture({ region, onCaptured }: CaptureProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [fileCue, setFileCue] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submitNote() {
    if (!text.trim()) return;
    setStatus({ kind: "busy", label: "Saving…" });
    try {
      const link = isLink(text);
      const { item } = await createItem({
        region_slug: region.slug,
        type: link ? "link" : "note",
        title: text.trim().slice(0, 140),
        source_url: link ? text.trim() : null,
        semantic_text: link ? null : text.trim(),
      });
      onCaptured(item);
      setText("");
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Could not save that." });
    }
  }

  async function submitFiles(files: FileList | File[]) {
    // Images, PDFs, and common document formats. Reject only obvious junk.
    const usable = Array.from(files).filter((f) => f.size > 0 && !f.type.startsWith("video/"));
    if (usable.length === 0) return;
    for (const file of usable) {
      setStatus({ kind: "busy", label: `Uploading ${file.name || "image"}…` });
      try {
        const key = await uploadBlob(file);
        const { item } = await createItem({
          region_slug: region.slug,
          type: typeForFile(file),
          title: file.name || "Pasted image",
          content_ref: key,
        });
        onCaptured(item);
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : `Could not upload ${file.name}.` });
        return;
      }
    }
    setStatus({ kind: "idle" });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3 shadow-2xl shadow-black/10">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void submitFiles(e.dataTransfer.files);
        }}
        className={`rounded-[var(--radius-md)] border shadow-sm transition-all duration-[var(--duration-fast)] focus-within:shadow-md ${
          dragging ? "border-muted bg-raised" : "border-line-soft bg-canvas"
        }`}
      >
        <textarea
          autoFocus
          rows={4}
          placeholder="Type text, paste a URL, drop or paste an image…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitNote();
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void submitFiles(files);
            }
          }}
          className="w-full resize-none bg-transparent px-3.5 py-3 text-[length:var(--text-body)] leading-relaxed text-text placeholder:text-faint"
        />
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              setFileCue((active) => !active);
              fileInputRef.current?.click();
            }}
            className="group inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-[length:var(--text-micro)] text-muted transition-all duration-[var(--duration-fast)] hover:bg-raised hover:text-text active:scale-95"
          >
            <span className={`inline-flex transition-transform duration-200 ${fileCue ? "rotate-45 scale-110" : "group-hover:rotate-90"}`}>
              <Icon name="plus" size={12} />
            </span>
            {fileCue ? "Ready to add" : "Add a file"}
          </button>
          <Button
            variant="primary"
            onClick={() => void submitNote()}
            disabled={!text.trim()}
            className="transition-all duration-[var(--duration-fast)] hover:-translate-y-px hover:bg-text hover:shadow-[0_0_16px_rgba(255,255,255,0.18)] active:translate-y-0 active:scale-95"
          >
            Save to {region.name}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.rtf,.key,.numbers"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void submitFiles(e.target.files);
            e.target.value = "";
            setFileCue(false);
          }}
        />
      </div>

      {status.kind === "busy" ? <Spinner label={status.label} /> : null}
      {status.kind === "error" ? (
        <p role="alert" className="text-[length:var(--text-meta)] text-bad">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
