/**
 * The design profile extracted from an image, shown to the person.
 *
 * Two reasons this is visible rather than hidden infrastructure. It is the
 * material an agent is actually given — so if it is wrong, the person should be
 * able to see that it is wrong rather than wonder why the work came back off.
 * And it separates the two provenances honestly: the colours are MEASURED from
 * the file's own pixels, everything else is a model's reading, and the panel
 * says which is which instead of presenting both as fact.
 */
import type { ContextItem, DesignProfile, PaletteEntry } from "@shared/contract";

function profileOf(item: ContextItem): DesignProfile | null {
  const d = (item.metadata as { design?: unknown }).design;
  if (typeof d !== "object" || d === null) return null;
  const maybe = d as Partial<DesignProfile>;
  return maybe.typography && maybe.layout && Array.isArray(maybe.palette) ? (d as DesignProfile) : null;
}

const words = (s: string) => s.replace(/_/g, " ");

/** Readable text on a swatch, so a hex label is legible on cream and on black alike. */
function readableOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 709 luma.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "#111111" : "#FFFFFF";
}

function Swatch({ entry }: { entry: PaletteEntry }) {
  return (
    <div
      className="flex flex-1 flex-col justify-end rounded-[var(--radius-sm)] px-1.5 py-1"
      style={{ backgroundColor: entry.hex, color: readableOn(entry.hex), minWidth: 0 }}
      title={`${entry.hex} · ${entry.role} · ${entry.pct}%`}
    >
      <span className="truncate text-micro tabular-nums opacity-90">{entry.hex}</span>
      <span className="truncate text-micro opacity-70">{entry.role}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-micro text-faint">{label}</span>
      <span className="text-right text-meta text-muted">{value}</span>
    </div>
  );
}

export function DesignPanel({ item }: { item: ContextItem }) {
  const d = profileOf(item);
  if (!d) return null;

  const type = [
    d.typography.scale === "none" ? null : words(d.typography.scale),
    d.typography.classification === "none" ? null : words(d.typography.classification),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
      <h3 className="text-micro uppercase tracking-wide text-faint">Design</h3>

      {d.palette.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex h-14 gap-1">
            {d.palette.map((p) => (
              <Swatch key={p.hex} entry={p} />
            ))}
          </div>
          <p className="text-micro text-faint">
            {d.palette_source === "measured"
              ? "Measured from this image's own pixels."
              : "Colours not measured yet."}
          </p>
        </div>
      ) : (
        <p className="text-micro text-faint">
          Colours not measured yet — open this folder again in a moment.
        </p>
      )}

      <div className="flex flex-col gap-1">
        {type ? <Row label="Type" value={type} /> : null}
        {d.typography.note ? <Row label="" value={d.typography.note} /> : null}
        <Row label="Layout" value={`${words(d.layout.composition)} · ${d.layout.density}`} />
        {d.texture.length > 0 ? <Row label="Texture" value={d.texture.map(words).join(", ")} /> : null}
        {d.imagery.treatment !== "none" ? (
          <Row label="Imagery" value={words(d.imagery.treatment)} />
        ) : null}
        {d.mood.length > 0 ? <Row label="Mood" value={d.mood.map(words).join(", ")} /> : null}
      </div>

      {/* Never presented as the person's own description of their reference. */}
      <p className="text-micro leading-relaxed text-faint">
        Read by {d.extracted_by.split("/").pop()}. Agents you grant access to receive these values.
      </p>
    </section>
  );
}
