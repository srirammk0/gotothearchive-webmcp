import type { Provenance } from "../../api/client";

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
      <p className="text-[length:var(--text-micro)] text-muted">{title}</p>
      <ul className={`mt-3 flex flex-col gap-2 text-[length:var(--text-meta)] ${muted ? "text-muted" : "text-text"}`}>
        {children}
      </ul>
    </div>
  );
}

export function ProvenanceStrip({ provenance }: { provenance: Provenance }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <Group title={`Used these references${count(provenance.influences.length)}`} accent="var(--color-good)">
        {provenance.influences.length === 0 ? (
          <li className="text-faint">None</li>
        ) : (
          provenance.influences.map((inf) => (
            <li key={inf.id}>
              {inf.item?.title ?? "Unknown item"}
              <span className="block text-[length:var(--text-micro)] text-faint">{inf.role}</span>
            </li>
          ))
        )}
      </Group>
      <Group title={`Accessed for this task${count(provenance.accesses.length)}`} accent="var(--color-line)">
        {provenance.accesses.length === 0 ? (
          <li className="text-faint">None</li>
        ) : (
          provenance.accesses.map((acc) => <li key={acc.id}>{acc.item?.title ?? "Unknown item"}</li>)
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
