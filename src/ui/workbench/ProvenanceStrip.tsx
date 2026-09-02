import type { Provenance } from "../../api/client";

/**
 * retrieval-architecture.md §5. The worker may attach a why() line and the
 * taste signals it applied to each retrieved/accessed row once retrieval
 * Tracks A/B land. Until then both are absent and the UI omits them —
 * always treat these as optional.
 */
interface RetrievalProvenanceFields {
  why?: string | null;
  applied_signal_ids?: string[] | null;
}

/** retrieval-architecture.md §5: the why() line and a "taste applied" chip. */
function RetrievalNote({ why, applied_signal_ids }: RetrievalProvenanceFields) {
  const applied = (applied_signal_ids ?? []).length > 0;
  if (!why && !applied) return null;
  return (
    <>
      {why ? <span className="mt-0.5 block text-micro text-faint">{why}</span> : null}
      {applied ? (
        <span className="mt-1 inline-block rounded-[var(--radius-sm)] bg-accent/15 px-1.5 py-px text-micro text-accent">
          taste applied
        </span>
      ) : null}
    </>
  );
}

/**
 * Three visually distinct groups, never merged — a contract invariant.
 * Denials are presented calmly (a quiet card, plain record), not as alarms.
 */
function count(n: number): string {
  return n === 0 ? "" : ` (${n})`;
}

function Group({
  title,
  accent,
  muted = false,
  children,
}: {
  title: string;
  accent: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 border-t-2 pt-3" style={{ borderColor: accent }}>
      <p className="text-micro text-muted">{title}</p>
      <ul className={`mt-3 flex flex-col gap-2 text-meta ${muted ? "text-muted" : "text-text"}`}>
        {children}
      </ul>
    </div>
  );
}

type ProvenanceWithNotes = {
  influences: (Provenance["influences"][number] & RetrievalProvenanceFields)[];
  accesses: (Provenance["accesses"][number] & RetrievalProvenanceFields)[];
  denials: Provenance["denials"];
};

export function ProvenanceStrip({ provenance }: { provenance: ProvenanceWithNotes }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <Group title={`Used these references${count(provenance.influences.length)}`} accent="var(--color-good)">
        {provenance.influences.length === 0 ? (
          <li className="text-faint">None</li>
        ) : (
          provenance.influences.map((inf) => (
            <li key={inf.id}>
              {inf.item?.title ?? "Unknown item"}
              <span className="block text-micro text-faint">{inf.role}</span>
              <RetrievalNote why={inf.why} applied_signal_ids={inf.applied_signal_ids} />
            </li>
          ))
        )}
      </Group>
      <Group title={`Accessed for this task${count(provenance.accesses.length)}`} accent="var(--color-line)">
        {provenance.accesses.length === 0 ? (
          <li className="text-faint">None</li>
        ) : (
          provenance.accesses.map((acc) => (
            <li key={acc.id}>
              {acc.item?.title ?? "Unknown item"}
              <RetrievalNote why={acc.why} applied_signal_ids={acc.applied_signal_ids} />
            </li>
          ))
        )}
      </Group>
      <Group title={`Unavailable or denied${count(provenance.denials.length)}`} accent="var(--color-line-soft)" muted>
        {provenance.denials.length === 0 ? (
          <li className="text-faint">None</li>
        ) : (
          provenance.denials.map((d) => <li key={d.id}>{d.reason}</li>)
        )}
      </Group>
    </div>
  );
}
