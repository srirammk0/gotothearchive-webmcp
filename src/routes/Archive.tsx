import { useEffect, useMemo, useState } from "react";
import type { ContextItem, ItemType } from "@shared/contract";
import { HairlineRule } from "../ui/primitives/HairlineRule";
import { EmptyState } from "../ui/primitives/EmptyState";
import { Spinner } from "../ui/primitives/Spinner";
import { Button } from "../ui/primitives/Button";
import { AgentAccess } from "../ui/AgentAccess";
import { Capture } from "../ui/archive/Capture";
import { useSpace } from "../ui/hooks/useSpace";
import { blobUrl, listItems } from "../api/client";
import type { ArchiveRegionView } from "../ui/viewmodels";

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

function hasImage(item: ContextItem): boolean {
  return (item.type === "image" || item.type === "screenshot") && !!item.content_ref;
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
              {hasImage(dominant) ? (
                <img
                  src={blobUrl(dominant.content_ref as string)}
                  alt=""
                  className="h-auto w-full max-w-2xl object-contain"
                />
              ) : null}
              <h3 className="font-serif text-[length:var(--text-section)] text-ink">{dominant.title}</h3>
              <p className="font-sans text-[length:var(--text-meta)] text-stone">
                {typeMeta(dominant.type)}
                {dominant.source_url ? ` · ${new URL(dominant.source_url).hostname}` : ""}
              </p>
            </article>
          ) : null}

          {rest.length > 0 ? (
            <ul className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {rest.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 border-t border-hairline pt-3">
                  {hasImage(item) ? (
                    <img
                      src={blobUrl(item.content_ref as string)}
                      alt=""
                      className="h-auto max-h-64 w-full object-contain"
                    />
                  ) : null}
                  <p className="font-serif text-[length:var(--text-item)] text-ink">{item.title}</p>
                  <p className="font-sans text-[length:var(--text-meta)] text-stone">{typeMeta(item.type)}</p>
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
  const { space, regions, task, loading: spaceLoading, error: spaceError } = useSpace();
  const [items, setItems] = useState<ContextItem[] | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    if (spaceLoading || spaceError) return;
    let cancelled = false;
    listItems()
      .then(({ items: fetched }) => {
        if (!cancelled) setItems(fetched);
      })
      .catch((err) => {
        if (!cancelled) setItemsError(err instanceof Error ? err.message : "Could not load the archive.");
      });
    return () => {
      cancelled = true;
    };
  }, [spaceLoading, spaceError]);

  const regionViews: ArchiveRegionView[] = useMemo(() => {
    if (!items) return regions.map((region) => ({ region, items: [] }));
    return regions.map((region) => ({ region, items: items.filter((i) => i.region_id === region.id) }));
  }, [regions, items]);

  const filteredRegions = useMemo(() => {
    if (!query.trim()) return regionViews;
    const q = query.toLowerCase();
    return regionViews.map((r) => ({ ...r, items: r.items.filter((i) => i.title.toLowerCase().includes(q)) }));
  }, [regionViews, query]);

  if (spaceLoading || (items === null && !itemsError)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label="Opening the archive…" />
      </div>
    );
  }

  if (spaceError || itemsError) {
    return (
      <EmptyState
        title="Couldn't load the archive"
        body={spaceError ?? itemsError ?? "Something went wrong."}
        action={
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-14">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">
                {space?.name}
              </p>
              <h1 className="mt-2 font-serif text-[length:var(--text-display)] leading-[1.05] text-ink">Archive</h1>
            </div>
            <Button variant="primary" onClick={() => setCaptureOpen((v) => !v)} aria-expanded={captureOpen}>
              + Capture
            </Button>
          </div>

          {captureOpen ? (
            <Capture
              regions={regions}
              onCaptured={(item) => setItems((prev) => [item, ...(prev ?? [])])}
            />
          ) : null}

          <div className="max-w-sm">
            <label className="flex flex-col gap-1.5">
              <span className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
                Search
              </span>
              <input
                placeholder="Search the archive…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border-b border-hairline bg-transparent py-1.5 font-sans text-[length:var(--text-body)] text-ink outline-none placeholder:text-stone-soft focus:border-ink"
              />
            </label>
          </div>
        </header>

        {filteredRegions.every((r) => r.items.length === 0) && (items?.length ?? 0) > 0 ? (
          <EmptyState
            title="No matches"
            body={`Nothing in the archive matches "${query}." Try a different word, or clear the search.`}
            action={
              <Button variant="ghost" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (items?.length ?? 0) === 0 ? (
          <EmptyState
            title="Your archive is empty"
            body="Capture a note, link, image, or PDF to start building this space's context."
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

      {task ? <AgentAccess taskId={task.id} regions={regions} /> : null}
    </div>
  );
}
