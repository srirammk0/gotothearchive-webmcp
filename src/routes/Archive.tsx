import { useMemo, useState } from "react";
import type { ItemType } from "@shared/contract";
import { HairlineRule } from "../ui/primitives/HairlineRule";
import { EmptyState } from "../ui/primitives/EmptyState";
import { Button } from "../ui/primitives/Button";
import { Field } from "../ui/primitives/Field";
import { AgentAccess } from "../ui/AgentAccess";
import { mockAgentAccess, mockArchive } from "../ui/mockData";
import type { ArchiveRegionView } from "../ui/viewmodels";

const CAPTURE_KINDS: { type: ItemType; label: string }[] = [
  { type: "note", label: "Note" },
  { type: "link", label: "Link" },
  { type: "image", label: "Image" },
  { type: "pdf", label: "PDF" },
];

function typeMeta(type: ItemType): string {
  switch (type) {
    case "image":
    case "screenshot":
      return "Image";
    case "pdf":
      return "PDF";
    case "link":
      return "Link";
    case "document":
      return "Document";
    case "note":
      return "Note";
  }
}

function RegionSection({ view, index }: { view: ArchiveRegionView; index: number }) {
  const dominant = index === 0 ? view.items[0] : undefined;
  const rest = dominant ? view.items.slice(1) : view.items;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[length:var(--text-headline)] text-ink">{view.region.name}</h2>
        <span className="font-sans text-[length:var(--text-meta)] text-stone">
          {view.items.length} {view.items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {view.items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Capture a note, link, image, or PDF and it will appear as part of this region's index."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {dominant ? (
            <article className="flex flex-col gap-3">
              {dominant.type === "image" || dominant.type === "screenshot" ? (
                <div className="aspect-[16/10] w-full max-w-2xl bg-paper-raised" aria-hidden="true" />
              ) : null}
              <h3 className="font-serif text-[length:var(--text-section)] text-ink">{dominant.title}</h3>
              <p className="font-sans text-[length:var(--text-meta)] text-stone">
                {typeMeta(dominant.type)} · {dominant.owner_id === "human_1" ? "You" : dominant.owner_id}
                {dominant.source_url ? ` · ${new URL(dominant.source_url).hostname}` : ""}
              </p>
            </article>
          ) : null}

          {rest.length > 0 ? (
            <ul className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {rest.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 border-t border-hairline pt-3">
                  <p className="font-serif text-[length:var(--text-item)] text-ink">{item.title}</p>
                  <p className="font-sans text-[length:var(--text-meta)] text-stone">
                    {typeMeta(item.type)} · {item.owner_id === "human_1" ? "You" : item.owner_id}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function Archive() {
  const [query, setQuery] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const archive = useMemo(() => mockArchive(), []);

  const filteredRegions = useMemo(() => {
    if (!query.trim()) return archive.regions;
    const q = query.toLowerCase();
    return archive.regions.map((r) => ({ ...r, items: r.items.filter((i) => i.title.toLowerCase().includes(q)) }));
  }, [archive, query]);

  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-14">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">
                {archive.space.name}
              </p>
              <h1 className="mt-2 font-serif text-[length:var(--text-display)] leading-[1.05] text-ink">Archive</h1>
            </div>
            <Button variant="primary" onClick={() => setCaptureOpen((v) => !v)} aria-expanded={captureOpen}>
              + Capture
            </Button>
          </div>

          {captureOpen ? (
            <div className="flex flex-wrap items-end gap-4 border-y border-hairline py-4">
              <div className="min-w-[220px] flex-1">
                <Field label="What are you saving?" placeholder="Paste a link, drop a file, or write a note…" />
              </div>
              <div className="flex gap-2">
                {CAPTURE_KINDS.map((k) => (
                  <Button key={k.type} variant="secondary">
                    {k.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="max-w-sm">
            <Field
              label="Search"
              placeholder="Search the archive…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </header>

        {filteredRegions.every((r) => r.items.length === 0) ? (
          <EmptyState
            title="No matches"
            body={`Nothing in the archive matches “${query}.” Try a different word, or clear the search.`}
            action={
              <Button variant="ghost" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          filteredRegions.map((view, i) => (
            <div key={view.region.id} className="flex flex-col gap-14">
              <RegionSection view={view} index={i} />
              {i < filteredRegions.length - 1 ? <HairlineRule /> : null}
            </div>
          ))
        )}
      </div>

      <AgentAccess model={mockAgentAccess} />
    </div>
  );
}
