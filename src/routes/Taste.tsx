import { useCallback, useEffect, useState } from "react";
import type { TasteSignal } from "@shared/contract";
import {
  ApiError,
  getTasteEvidence,
  listTasteSignals,
  updateTasteSignal,
  type EvidenceRecord,
} from "../api/client";
import { Button } from "../ui/primitives/Button";
import { HairlineRule } from "../ui/primitives/HairlineRule";
import { Disclosure } from "../ui/primitives/Disclosure";
import { EmptyState } from "../ui/primitives/EmptyState";
import { Spinner } from "../ui/primitives/Spinner";

function confidenceWord(confidence: number): string {
  if (confidence >= 0.8) return "Strong";
  if (confidence >= 0.55) return "Moderate";
  return "Early";
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

  const loadEvidence = useCallback(() => {
    if (evidence !== null) return;
    getTasteEvidence(signal.id)
      .then((r) => setEvidence(r.evidence))
      .catch(() => setEvidence([]));
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
    <article className="flex flex-col gap-3 border-t border-hairline pt-5">
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="border-b border-hairline bg-transparent py-1.5 font-serif text-[length:var(--text-item)] text-ink outline-none focus:border-ink"
        />
      ) : (
        <p className="font-serif text-[length:var(--text-item)] text-ink">{signal.statement}</p>
      )}
      <p className="font-sans text-[length:var(--text-meta)] text-stone">
        {signal.dimensions.join(" · ")} · {signal.scope} · {confidenceWord(signal.confidence)} confidence
      </p>

      <Disclosure summary="Evidence" onOpen={loadEvidence}>
        {evidence === null ? (
          <p className="py-2 font-sans text-[length:var(--text-meta)] text-stone">Looking for what supports this…</p>
        ) : evidence.length === 0 ? (
          <p className="py-2 font-sans text-[length:var(--text-meta)] text-stone">
            Nothing cited yet. A proposal without evidence stays a proposal.
          </p>
        ) : (
          <ul className="space-y-2 py-2">
            {evidence.map((e) => (
              <li key={e.id} className="font-sans text-[length:var(--text-meta)] text-ink-soft">
                <span aria-hidden="true">{e.kind === "supports" ? "+" : "−"}</span>{" "}
                <span className="sr-only">{e.kind === "supports" ? "Supports:" : "Contradicts:"}</span>
                {e.annotation ? `“${e.annotation.comment}”` : (e.item?.title ?? "Recorded evidence")}
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
          <span role="alert" className="font-sans text-[length:var(--text-meta)] text-bad">
            {err}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function Taste() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [signals, setSignals] = useState<TasteSignal[]>([]);

  const load = () => {
    setStatus("loading");
    listTasteSignals()
      .then(({ signals: loaded }) => {
        setSignals(loaded);
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

  const pending = signals.filter((s) => s.status === "proposed");
  const confirmed = signals.filter((s) => s.status === "confirmed");

  return (
    <div className="flex max-w-2xl flex-col gap-14">
      <header>
        <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">
          Curated notebook
        </p>
        <h1 className="mt-2 font-serif text-[length:var(--text-display)] leading-[1.05] text-ink">Taste</h1>
      </header>

      {status === "loading" ? <Spinner label="Loading signals…" /> : null}
      {status === "error" ? (
        <EmptyState title="Couldn't load taste signals" body="Something went wrong reaching the server. Try again shortly." />
      ) : null}

      {status === "ready" ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-[length:var(--text-meta)] uppercase tracking-[0.14em] text-stone">
              Pending proposals
            </h2>
            {pending.length === 0 ? (
              <EmptyState
                title="Nothing waiting on you"
                body="Proposed taste signals appear here first, with their evidence one expansion away, until you accept, edit, rescope, or reject them."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map((s) => (
                  <SignalCard key={s.id} signal={s} onAct={act} />
                ))}
              </div>
            )}
          </section>

          <HairlineRule />

          <section className="flex flex-col gap-3">
            <h2 className="font-sans text-[length:var(--text-meta)] uppercase tracking-[0.14em] text-stone">
              Confirmed
            </h2>
            {confirmed.length === 0 ? (
              <EmptyState title="No confirmed signals yet" body="Accepted proposals settle here, organized by scope." />
            ) : (
              <div className="flex flex-col gap-2">
                {confirmed.map((s) => (
                  <SignalCard key={s.id} signal={s} onAct={act} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
