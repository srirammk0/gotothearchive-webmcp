import type { Provenance } from "../../api/client";

/**
 * Three visually distinct groups, never merged — a contract invariant.
 * Denials are presented calmly (stone tone, plain record), not as alarms.
 */
export function ProvenanceStrip({ provenance }: { provenance: Provenance }) {
  return (
    <div className="flex flex-col gap-6 border-t border-hairline pt-6 sm:flex-row sm:gap-10">
      <div className="flex-1 border-l-2 border-good/60 pl-4">
        <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
          Used these references
        </p>
        <ul className="mt-2 flex flex-col gap-1 font-sans text-[length:var(--text-meta)] text-ink">
          {provenance.influences.length === 0 ? (
            <li className="text-stone">None</li>
          ) : (
            provenance.influences.map((inf) => (
              <li key={inf.id}>
                {inf.item?.title ?? "Unknown item"} <span className="text-stone">— {inf.role}</span>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="flex-1 border-l-2 border-hairline pl-4">
        <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
          Accessed for this task
        </p>
        <ul className="mt-2 flex flex-col gap-1 font-sans text-[length:var(--text-meta)] text-ink">
          {provenance.accesses.length === 0 ? (
            <li className="text-stone">None</li>
          ) : (
            provenance.accesses.map((acc) => <li key={acc.id}>{acc.item?.title ?? "Unknown item"}</li>)
          )}
        </ul>
      </div>
      <div className="flex-1 border-l-2 border-stone-soft pl-4">
        <p className="font-sans text-[length:var(--text-micro)] uppercase tracking-[0.14em] text-stone">
          Unavailable or denied
        </p>
        <ul className="mt-2 flex flex-col gap-1 font-sans text-[length:var(--text-meta)] text-ink-soft">
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
