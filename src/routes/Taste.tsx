import { useCallback, useEffect, useState } from "react";
import type { ContextItem, TasteSignal } from "@shared/contract";
import {
  ApiError,
  blobUrl,
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
import { FileCard, kind, tweetId } from "../ui/archive/itemKind";
import { Tweet } from "../ui/archive/Tweet";
import { useTrail } from "../ui/Breadcrumbs";
import { duration, ease } from "../ui/tokens";
import { EmptyState } from "../ui/primitives/EmptyState";
import { EmptyRow } from "../ui/primitives/EmptyRow";
import { SidePanel } from "../ui/primitives/SidePanel";
import { Spinner } from "../ui/primitives/Spinner";

/** A thumbnail for an archived item cited as taste evidence. */
function ItemThumb({ item }: { item: ContextItem }) {
  const { render } = kind(item);
  if (render === "image" && item.content_ref) {
    return <img src={blobUrl(item.content_ref)} alt="" className="h-full w-full object-cover" />;
  }
  const tw = render === "tweet" ? tweetId(item.source_url) : null;
  if (tw) return <Tweet id={tw} className="scale-90" />;
  if (render === "office" || render === "pdf") return <FileCard item={item} />;
  return (
    <p className="line-clamp-4 p-2 text-[length:var(--text-micro)] leading-relaxed text-muted">
      {item.semantic_text ?? item.title}
    </p>
  );
}

/** One piece of evidence — an archived item or a recorded annotation. */
function EvidenceCard({ record }: { record: EvidenceRecord }) {
  const supports = record.kind === "supports";
  return (
    <div className="flex gap-3 rounded-[var(--radius-md)] border border-line-soft bg-surface p-3">
      <span
        className={`mt-0.5 shrink-0 rounded-[var(--radius-sm)] px-1.5 py-px text-[length:var(--text-micro)] ${
          supports ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
        }`}
      >
        {supports ? "Supports" : "Counters"}
      </span>
      {record.item ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-line-soft bg-canvas">
            <ItemThumb item={record.item} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[length:var(--text-meta)] text-text">{record.item.title}</p>
            <p className="truncate text-[length:var(--text-micro)] text-faint">
              {kind(record.item).label}
              {record.item.source_url
                ? ` · ${new URL(record.item.source_url).hostname.replace(/^www\./, "")}`
                : ""}
            </p>
          </div>
        </div>
      ) : record.annotation ? (
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--text-meta)] leading-relaxed text-muted">“{record.annotation.comment}”</p>
          <p className="mt-1 text-[length:var(--text-micro)] text-faint">
            {record.annotation.dimension ?? "general"} · review note
          </p>
        </div>
      ) : (
        <p className="flex-1 text-[length:var(--text-meta)] text-faint">Recorded evidence</p>
      )}
    </div>
  );
}

/**
 * Dimensions are stored as snake_case enum values. Ordinary UI copy must never
 * show an internal term, so they are humanized for display only — the stored
 * values are unchanged, since retrieval and evidence depend on them.
 */
function dimensionLabel(dimension: string): string {
  const words = dimension.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function confidenceWord(confidence: number): string {
  if (confidence >= 0.8) return "Strong";
  if (confidence >= 0.55) return "Moderate";
  return "Early";
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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

  const [draft, setDraft] = useState(signal.statement);

  const run = async (changes: { status?: TasteSignal["status"]; statement?: string; scope?: TasteSignal["scope"] }) => {
    setBusy(true);
    setErr(null);
    try {
      await onAct(signal.id, changes);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease }}
      className="flex flex-col gap-2.5 border-b border-line-soft py-5"
    >
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 rounded-[var(--radius-sm)] px-1.5 py-px text-[length:var(--text-micro)] ${
            signal.created_by === "system" ? "bg-accent/15 text-accent" : "bg-hover text-muted"
          }`}
        >
          {signal.created_by === "system" ? "Agent" : "You"}
        </span>
        <span className="text-[length:var(--text-micro)] text-faint">{relTime(signal.created_at)}</span>
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className={`${controlClass} resize-none`}
        />
      ) : (
        <p className="text-[length:var(--text-section)] leading-snug text-text">{signal.statement}</p>
      )}
      <p className="text-[length:var(--text-micro)] text-faint">
        {signal.dimensions.map(dimensionLabel).join(" · ")} · {signal.scope === "personal" ? "Personal" : "Project"} ·{" "}
        {confidenceWord(signal.confidence)} confidence
        {history && history.some((e) => e.kind === "applied")
          ? ` · used ${history.filter((e) => e.kind === "applied").length}×`
          : ""}
      </p>

      <Disclosure summary="Evidence" onOpen={load}>
        {evidence === null ? (
          <p className="py-2 text-[length:var(--text-meta)] text-faint">Looking for what supports this…</p>
        ) : evidence.length === 0 ? (
          <p className="py-2 text-[length:var(--text-meta)] text-faint">
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
          <p className="py-2 text-[length:var(--text-meta)] text-faint">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="py-2 text-[length:var(--text-meta)] text-faint">No history recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 py-2">
            {history
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4 text-[length:var(--text-meta)]">
                  <span className="min-w-0 text-muted">
                    <span
                      className={`mr-1.5 rounded-[var(--radius-sm)] px-1.5 py-px text-[length:var(--text-micro)] ${
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
                  <span className="shrink-0 text-[length:var(--text-micro)] text-faint">{relTime(e.at)}</span>
                </li>
              ))}
          </ul>
        )}
      </Disclosure>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {editing ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => void run({ statement: draft.trim() })}>
              Save statement
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {signal.status === "proposed" ? (
              <Button variant="primary" disabled={busy} onClick={() => void run({ status: "confirmed" })}>
                Accept
              </Button>
            ) : null}
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run({ scope: signal.scope === "personal" ? "project" : "personal" })}
            >
              {signal.scope === "personal" ? "Share with project" : "Make personal"}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void run({ status: "rejected" })}>
              Reject
            </Button>
          </>
        )}
        {busy ? <Spinner label="Saving…" /> : null}
        {err ? (
          <span role="alert" className="text-[length:var(--text-meta)] text-bad">
            {err}
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

  const load = () => {
    setStatus("loading");
    listTasteSignals()
      .then(({ signals: loaded, recent_events }) => {
        setSignals(loaded);
        setFeed(recent_events);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };

  useEffect(load, []);

  const act = async (
    id: string,
    changes: { status?: TasteSignal["status"]; statement?: string; scope?: TasteSignal["scope"] },
  ) => {
    const { signal } = await updateTasteSignal(id, changes);
    setSignals((prev) => prev.map((s) => (s.id === id ? signal : s)));
  };

  useTrail([{ label: "Taste" }]);

  const pending = signals.filter((s) => s.status === "proposed");
  const confirmed = signals.filter((s) => s.status === "confirmed");

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
      <div className="flex max-w-4xl flex-col gap-12">
        <header>
          <h1 className="text-[length:var(--text-display)] leading-tight text-text">Taste</h1>
          <p className="mt-1 text-[length:var(--text-meta)] text-faint">
            What this space has decided it believes, and what is still only proposed.
          </p>
        </header>

        {status === "loading" ? <Spinner label="Loading signals…" /> : null}
        {status === "error" ? (
          <EmptyState
            title="Couldn't load taste signals"
            body="Something went wrong reaching the server. Try again shortly."
          />
        ) : null}

        {status === "ready" ? (
          <>
            <section className="flex flex-col gap-1">
              <h2 className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2.5 text-[length:var(--text-headline)] text-text">
                Pending proposals <span className="text-[length:var(--text-micro)] text-faint">{pending.length}</span>
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
              <h2 className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-2.5 text-[length:var(--text-headline)] text-text">
                Confirmed <span className="text-[length:var(--text-micro)] text-faint">{confirmed.length}</span>
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
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[length:var(--text-meta)] text-text">
                        <span className="text-muted">{e.actor_label}</span> {VERB[e.kind] ?? e.kind}
                      </span>
                      <span className="ml-auto shrink-0 text-[length:var(--text-micro)] text-faint">
                        {relTime(e.at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[length:var(--text-meta)] leading-snug text-faint">
                      {e.statement}
                    </p>
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
