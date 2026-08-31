import { useMemo, useState } from "react";
import { Button } from "../ui/primitives/Button";
import { HairlineRule } from "../ui/primitives/HairlineRule";
import { Disclosure } from "../ui/primitives/Disclosure";
import { EmptyState } from "../ui/primitives/EmptyState";
import { mockTaste } from "../ui/mockData";
import type { TasteProposalView } from "../ui/viewmodels";

function ProposalCard({ proposal, onDecide }: { proposal: TasteProposalView; onDecide: (id: string) => void }) {
  const { signal, evidence } = proposal;
  return (
    <article className="flex flex-col gap-3 border-t border-hairline pt-5">
      <p className="font-serif text-[length:var(--text-item)] text-ink">{signal.statement}</p>
      <p className="font-sans text-[length:var(--text-meta)] text-stone">
        {signal.dimensions.join(" · ")} · {Math.round(signal.confidence * 100)}% confidence
      </p>

      <Disclosure summary={`Evidence (${evidence.length})`}>
        <ul className="flex flex-col gap-1 py-2 font-sans text-[length:var(--text-meta)] text-ink-soft">
          {evidence.map((e) => (
            <li key={e.id}>
              {e.kind === "supports" ? "Supports" : "Contradicts"} — {e.label}
            </li>
          ))}
        </ul>
      </Disclosure>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="primary" onClick={() => onDecide(signal.id)}>
          Accept
        </Button>
        <Button variant="secondary">Edit</Button>
        <Button variant="secondary">Rescope</Button>
        <Button variant="danger" onClick={() => onDecide(signal.id)}>
          Reject
        </Button>
      </div>
    </article>
  );
}

export function Taste() {
  const model = useMemo(() => mockTaste(), []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const pending = model.pending.filter((p) => !dismissed.has(p.signal.id));

  return (
    <div className="flex max-w-2xl flex-col gap-14">
      <header>
        <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.18em] text-stone">
          Curated notebook
        </p>
        <h1 className="mt-2 font-serif text-[length:var(--text-display)] leading-[1.05] text-ink">Taste</h1>
      </header>

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
            {pending.map((p) => (
              <ProposalCard
                key={p.signal.id}
                proposal={p}
                onDecide={(id) => setDismissed((prev) => new Set(prev).add(id))}
              />
            ))}
          </div>
        )}
      </section>

      <HairlineRule />

      <section className="flex flex-col gap-3">
        <h2 className="font-sans text-[length:var(--text-meta)] uppercase tracking-[0.14em] text-stone">
          Confirmed
        </h2>
        {model.confirmed.length === 0 ? (
          <EmptyState title="No confirmed signals yet" body="Accepted proposals settle here, organized by scope." />
        ) : (
          <ul className="flex flex-col gap-4">
            {model.confirmed.map((s) => (
              <li key={s.id} className="border-t border-hairline pt-3">
                <p className="font-serif text-[length:var(--text-item)] text-ink">{s.statement}</p>
                <p className="mt-1 font-sans text-[length:var(--text-meta)] text-stone">
                  {s.scope} · {s.dimensions.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
