import type { Provenance } from "../../api/client";

/**
 * Three visually distinct groups, never merged — a contract invariant.
 * Denials are presented calmly (stone tone, plain record), not as alarms.
 */
function count(n: number): string {
  return n === 0 ? "" : ` (${n})`;
}

export function ProvenanceStrip({ provenance }: { provenance: Provenance }) {
  return (
    <div className="flex flex-col gap-8 border-t border-hairline pt-8 sm:flex-row sm:gap-12">
      <div className="flex-1 border-l-2 border-good pl-5">
        <p className="font-sans text-[length:var(--text-meta)] font-medium uppercase tracking-[0.1em] text-ink">
          Used these references{count(provenance.influences.length)}
        </p>
        <ul className="mt-3 flex flex-col gap-2 font-sans text-[length:var(--text-body)] text-ink">
          {provenance.influences.length === 0 ? (
            <li className="text-stone">None</li>
          ) : (
            provenance.influences.map((inf) => (
              <li key={inf.id}>
                {inf.item?.title ?? "Unknown item"}
                <span className="block text-[length:var(--text-meta)] text-stone">{inf.role}</span>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="flex-1 border-l-2 border-hairline pl-5">
        <p className="font-sans text-[length:var(--text-meta)] font-medium uppercase tracking-[0.1em] text-ink">
          Accessed for this task{count(provenance.accesses.length)}
        </p>
        <ul className="mt-3 flex flex-col gap-2 font-sans text-[length:var(--text-body)] text-ink">
          {provenance.accesses.length === 0 ? (
            <li className="text-stone">None</li>
          ) : (
            provenance.accesses.map((acc) => <li key={acc.id}>{acc.item?.title ?? "Unknown item"}</li>)
          )}
        </ul>
      </div>
      <div className="flex-1 border-l-2 border-stone-soft pl-5">
        <p className="font-sans text-[length:var(--text-meta)] font-medium uppercase tracking-[0.1em] text-ink-soft">
          Unavailable or denied{count(provenance.denials.length)}
        </p>
        <ul className="mt-3 flex flex-col gap-2 font-sans text-[length:var(--text-body)] text-ink-soft">
          {provenance.denials.length === 0 ? (
            <li className="text-stone">None</li>
          ) : (
            provenance.denials.map((d) => <li key={d.id}>{d.reason}</li>)
          )}
        </ul>
      </div>
    </div>
  );
}
