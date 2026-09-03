import { useCallback, useEffect, useState, type ReactNode } from "react";
import { confidenceLabel, dimensionLabel, type ContextItem, type TasteSignal } from "@shared/contract";
import {
  getTasteEvidence,
  listTasteSignals,
  updateTasteSignal,
  type EvidenceRecord,
  type TasteFeedEvent,
  type TasteHistoryEvent,
} from "../api/client";
import { motion } from "motion/react";
import { Button } from "../ui/primitives/Button";
import { Disclosure } from "../ui/primitives/Disclosure";
import { controlClass } from "../ui/primitives/Field";
import { kind } from "../ui/archive/itemKind";
import { ItemPreview } from "../ui/archive/ItemPreview";
import { ArtifactThumb } from "../ui/workbench/ArtifactThumb";
import { useTrail } from "../ui/Breadcrumbs";
import { useAction } from "../ui/hooks/useAction";
import { duration, ease } from "../ui/tokens";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { Spinner } from "../ui/primitives/Spinner";

/** The right-rail panel shape: a hairline top border, a quiet section title, sticky on wide screens. */
function SidePanel({ title, label, children }: { title: string; label?: ReactNode; children: ReactNode }) {
  return (
    <aside aria-label={title} className="flex h-fit flex-col gap-4 border-t border-line pt-4 lg:sticky lg:top-20">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-section text-text">{title}</p>
        {label ? <span className="text-micro text-faint">{label}</span> : null}
      </div>
      {children}
    </aside>
  );
}

/** One piece of evidence — an archived item or a recorded annotation. */
function EvidenceCard({ record }: { record: EvidenceRecord }) {
  const supports = record.kind === "supports";
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-line-soft bg-surface p-3">
      <span
        className={`mt-0.5 shrink-0 self-start rounded-[var(--radius-sm)] px-1.5 py-px text-micro leading-tight ${
          supports ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
        }`}
      >
        {supports ? "Supports" : "Counters"}
      </span>
      {record.item ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-line-soft bg-canvas">
            <ItemPreview item={record.item} size="thumb" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-meta text-text">{record.item.title}</p>
            <p className="truncate text-micro text-faint">
              {kind(record.item).label}
              {record.item.source_url
                ? ` · ${new URL(record.item.source_url).hostname.replace(/^www\./, "")}`
                : ""}
            </p>
          </div>
        </div>
      ) : record.annotation ? (
        <div className="min-w-0 flex-1">
          <p className="text-meta leading-relaxed text-muted">“{record.annotation.comment}”</p>
          <p className="mt-1 text-micro text-faint">
            {record.annotation.dimensions.map(dimensionLabel).join(", ") || "general"} · review note
          </p>
        </div>
      ) : (
        <p className="flex-1 text-meta text-faint">Recorded evidence</p>
      )}
    </div>
  );
}

const VERB: Record<string, string> = {
  proposed: "proposed",
  edited: "reworded",
  accepted: "accepted",
  rescoped: "rescoped",
  rejected: "rejected",
  superseded: "superseded",
  applied: "applied it to work",
};

function relTime(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function reversed<T>(values: T[]): T[] {
  return Array.from({ length: values.length }, (_, i) => values[values.length - 1 - i]);
}

function SignalCard({
  signal,
  onAct,
}: {
  signal: TasteSignal;
  onAct: (
    id: string,
    changes: { status?: TasteSignal["status"]; statement?: string; scope?: TasteSignal["scope"] },
  ) => Promise<void>;
}) {
  const action = useAction("That didn't go through. Try again.");
  const [editing, setEditing] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceRecord[] | null>(null);
  const [history, setHistory] = useState<TasteHistoryEvent[] | null>(null);

  const load = useCallback(() => {
    if (evidence !== null) return;
    getTasteEvidence(signal.id)
      .then((r) => {
        setEvidence(r.evidence);
        setHistory(r.events);
      })
      .catch(() => {
        setEvidence([]);
        setHistory([]);
      });
  }, [evidence, signal.id]);

  // Evidence + history load eagerly: the card shows a source-thumbnail strip
  // and a revised signal shows its lineage, both without opening a disclosure.
  useEffect(() => {
    load();
  }, [load]);

  const [draft, setDraft] = useState(signal.statement);

  const revisions = (history ?? []).filter((e) => e.kind === "superseded" || e.kind === "edited");
  const sourceItems = (evidence ?? []).map((e) => e.item).filter((i): i is ContextItem => i !== null);
  const noteCount = (evidence ?? []).filter((e) => e.annotation).length;

  const run = (changes: { status?: TasteSignal["status"]; statement?: string; scope?: TasteSignal["scope"] }) =>
    action.run(() => onAct(signal.id, changes)).then((ok) => ok && setEditing(false));

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease }}
      className="flex flex-col gap-2.5 border-b border-line-soft py-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`shrink-0 rounded-[var(--radius-sm)] px-1.5 py-px text-micro ${
            signal.created_by === "system" ? "bg-accent/15 text-accent" : "bg-hover text-muted"
          }`}
        >
          {signal.created_by === "system" ? "Agent" : "You"}
        </span>
        {signal.created_by === "system" && signal.status === "proposed" ? (
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-hover px-1.5 py-px text-micro text-muted">
            proposed from your notes
          </span>
        ) : null}
        {signal.supersedes ? (
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-hover px-1.5 py-px text-micro text-muted">
            revised
          </span>
        ) : null}
        <span className="text-micro text-faint">{relTime(signal.created_at)}</span>
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className={`${controlClass} resize-none`}
        />
      ) : (
        <p className="text-section leading-snug text-text">{signal.statement}</p>
      )}

      {sourceItems.length > 0 || noteCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {sourceItems.slice(0, 6).map((it) => (
            <div
              key={it.id}
              title={it.title}
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-line-soft bg-canvas"
            >
              <ItemPreview item={it} size="thumb" />
            </div>
          ))}
          {sourceItems.length > 6 ? (
            <span className="text-micro text-faint">+{sourceItems.length - 6}</span>
          ) : null}
          {noteCount > 0 ? (
            <span className="rounded-[var(--radius-sm)] bg-hover px-1.5 py-1 text-micro text-muted">
              {noteCount} note{noteCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="text-micro text-faint">
        {signal.dimensions.map(dimensionLabel).join(" · ")} · {signal.scope === "personal" ? "Personal" : "Project"} ·{" "}
        {confidenceLabel(signal.confidence)} confidence
        {history && history.some((e) => e.kind === "applied")
          ? ` · used ${history.filter((e) => e.kind === "applied").length}×`
          : ""}
      </p>

      {signal.supersedes && revisions.length > 0 ? (
        <ol className="flex flex-col gap-1 border-l border-line-soft pl-3 text-micro text-faint">
          {reversed(revisions).map((e) => (
              <li key={e.id}>
                {e.kind === "edited" ? "Reworded" : "Replaced"}
                {e.detail ? ` “${e.detail}”` : " an earlier statement"} · {relTime(e.at)}
              </li>
            ))}
        </ol>
      ) : null}

      <Disclosure summary="Evidence" onOpen={load}>
        {evidence === null ? (
          <p className="py-2 text-meta text-faint">Looking for what supports this…</p>
        ) : evidence.length === 0 ? (
          <p className="py-2 text-meta text-faint">
            Nothing cited yet. A proposal without evidence stays a proposal.
          </p>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {evidence.map((e) => (
              <EvidenceCard key={e.id} record={e} />
            ))}
          </div>
        )}
      </Disclosure>

      <Disclosure summary="History" onOpen={load}>
        {history === null ? (
          <p className="py-2 text-meta text-faint">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="py-2 text-meta text-faint">No history recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 py-2">
            {reversed(history).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4 text-meta">
                  <span className="min-w-0 text-muted">
                    <span
                      className={`mr-1.5 rounded-[var(--radius-sm)] px-1.5 py-px text-micro ${
                        e.actor_type === "agent"
                          ? "bg-accent/15 text-accent"
                          : e.actor_type === "human"
                            ? "bg-good/15 text-good"
                            : "bg-hover text-muted"
                      }`}
                    >
                      {e.actor_label}
                    </span>
                    {e.kind}
                    {e.artifact ? ` — ${e.artifact.title} v${e.artifact.version_no}` : e.detail ? ` — ${e.detail}` : ""}
                  </span>
                  <span className="shrink-0 text-micro text-faint">{relTime(e.at)}</span>
                </li>
              ))}
          </ul>
        )}
      </Disclosure>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {editing ? (
          <>
            <Button variant="primary" disabled={action.busy} onClick={() => void run({ statement: draft.trim() })}>
              Save statement
            </Button>
            <Button variant="secondary" disabled={action.busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {signal.status === "proposed" ? (
              <Button variant="primary" disabled={action.busy} onClick={() => void run({ status: "confirmed" })}>
                Accept
              </Button>
            ) : null}
            <Button variant="secondary" disabled={action.busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => void run({ scope: signal.scope === "personal" ? "project" : "personal" })}
            >
              {signal.scope === "personal" ? "Share with project" : "Make personal"}
            </Button>
            <Button variant="danger" disabled={action.busy} onClick={() => void run({ status: "rejected" })}>
              Reject
            </Button>
          </>
        )}
        {action.busy ? <Spinner label="Saving…" /> : null}
        {action.error ? (
          <span role="alert" className="text-meta text-bad">
            {action.error}
          </span>
        ) : null}
      </div>
    </motion.article>
  );
}

export function Taste() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [signals, setSignals] = useState<TasteSignal[]>([]);
  const [feed, setFeed] = useState<TasteFeedEvent[]>([]);

  const load = (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setStatus("loading");
    listTasteSignals()
      .then(({ signals: loaded, recent_events }) => {
        setSignals(loaded);
        setFeed(recent_events);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };

  useEffect(() => load(), []);

  const act = async (
    id: string,
    changes: { status?: TasteSignal["status"]; statement?: string; scope?: TasteSignal["scope"] },
  ) => {
    const { signal } = await updateTasteSignal(id, changes);
    setSignals((prev) => prev.map((s) => (s.id === id ? signal : s)));
    // Confirming/editing/rescoping produces new evidence + activity — pull it in.
    load({ silent: true });
  };

  useTrail([{ label: "Taste" }]);

  const pending = signals.filter((s) => s.status === "proposed");
  const confirmed = signals.filter((s) => s.status === "confirmed");

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
      <div className="flex max-w-4xl flex-col gap-12">
        <header>
          <h1 className="text-display leading-tight text-text">Taste</h1>
          <p className="mt-1 text-meta text-faint">
            What this space has decided it believes, and what is still only proposed.
          </p>
        </header>

        {status === "loading" ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">Loading signals</span>
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="h-20 rounded-[var(--radius-md)] bg-surface animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null}
        {status === "error" ? (
          <EmptyState
            title="Couldn't load taste signals"
            body="Something went wrong reaching the server. Try again shortly."
          />
        ) : null}

        {status === "ready" ? (
          <>
            <section className="flex flex-col gap-1">
              <h2 className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2.5 text-headline text-text">
                Pending proposals <span className="text-micro text-faint">{pending.length}</span>
              </h2>
              {pending.length === 0 ? (
                <EmptyRow>Nothing waiting on you</EmptyRow>
              ) : (
                <div className="flex flex-col">
                  {pending.map((s) => (
                    <SignalCard key={s.id} signal={s} onAct={act} />
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-1">
              <h2 className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2.5 text-headline text-text">
                Confirmed <span className="text-micro text-faint">{confirmed.length}</span>
              </h2>
              {confirmed.length === 0 ? (
                <EmptyRow>No confirmed signals yet</EmptyRow>
              ) : (
                <div className="flex flex-col">
                  {confirmed.map((s) => (
                    <SignalCard key={s.id} signal={s} onAct={act} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>

      {status === "ready" && feed.length > 0 ? (
        <SidePanel title="Taste activity" label={`${feed.filter((e) => e.kind === "applied").length} uses`}>
          <ol className="relative flex flex-col gap-1 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-line-soft">
            {feed.slice(0, 12).map((e) => {
              const dot =
                e.actor_type === "agent" ? "bg-accent" : e.actor_type === "human" ? "bg-good" : "bg-faint";
              return (
                <li key={e.id} className="relative flex gap-3 rounded-[var(--radius-sm)] py-1.5 pl-0 pr-1">
                  <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot} ring-4 ring-canvas`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-meta text-text">
                        <span className="text-muted">{e.actor_label}</span> {VERB[e.kind] ?? e.kind}
                      </span>
                      <span className="ml-auto shrink-0 text-micro text-faint">
                        {relTime(e.at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-meta leading-snug text-faint">
                      {e.statement}
                    </p>
                    {e.artifact ? (
                      <div className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-line-soft bg-canvas p-1.5">
                        <div className="h-9 w-12 shrink-0 overflow-hidden rounded-[2px]">
                          <ArtifactThumb html={e.artifact.preview_html} className="h-full w-full" />
                        </div>
                        <span className="truncate text-micro text-muted">{e.artifact.title}</span>
                      </div>
                    ) : e.item ? (
                      <div className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-line-soft bg-canvas p-1.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[2px]">
                          <ItemPreview item={e.item} size="thumb" />
                        </div>
                        <span className="truncate text-micro text-muted">{e.item.title}</span>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </SidePanel>
      ) : null}
    </div>
  );
}
