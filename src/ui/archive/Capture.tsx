import { useRef, useState } from "react";
import type { ContextItem, ItemType, Region } from "@shared/contract";
import { createItem, uploadBlob } from "../../api/client";
import { Button } from "../primitives/Button";
import { Field } from "../primitives/Field";
import { Spinner } from "../primitives/Spinner";

export interface CaptureProps {
  regions: Region[];
  onCaptured: (item: ContextItem) => void;
}

type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

function typeForFile(file: File): ItemType {
  return file.type === "application/pdf" ? "pdf" : "image";
}

function isLink(text: string): boolean {
  try {
    const url = new URL(text);
    return !!url;
  } catch {
    return false;
  }
}

/** Note/link composer plus a drag-and-drop + file-picker upload path. */
export function Capture({ regions, onCaptured }: CaptureProps) {
  const [text, setText] = useState("");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const region = regions.find((r) => r.id === regionId) ?? regions[0];

  async function submitNote() {
    if (!text.trim() || !region) return;
    setStatus({ kind: "busy", label: "Saving…" });
    try {
      const link = isLink(text.trim());
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
    if (!region) return;
    for (const file of Array.from(files)) {
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) continue;
      setStatus({ kind: "busy", label: `Uploading ${file.name}…` });
      try {
        const key = await uploadBlob(file);
        const { item } = await createItem({
          region_slug: region.slug,
          type: typeForFile(file),
          title: file.name,
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
    <div className="flex flex-col gap-4 border-y border-hairline py-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <Field
            label="What are you saving?"
            placeholder="Paste a link, or write a note…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNote();
            }}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
            Region
          </span>
          <select
            value={regionId || region?.id}
            onChange={(e) => setRegionId(e.target.value)}
            className="border-b border-hairline bg-transparent py-1.5 font-sans text-[length:var(--text-body)] text-ink outline-none focus:border-ink"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" onClick={() => void submitNote()} disabled={!text.trim()}>
          Save
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
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
        aria-label="Drop an image or PDF here, or activate to choose a file"
        className={`flex cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed px-4 py-6 text-center font-sans text-[length:var(--text-meta)] transition-colors duration-[var(--duration-fast)] ${
          dragging ? "border-ink text-ink" : "border-hairline text-stone hover:border-ink hover:text-ink"
        }`}
      >
        Drop an image or PDF here, or choose a file
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void submitFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {status.kind === "busy" ? <Spinner label={status.label} /> : null}
      {status.kind === "error" ? (
        <p role="alert" className="font-sans text-[length:var(--text-meta)] text-bad">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
