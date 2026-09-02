import { useEffect, useState } from "react";
import { getMemoryStatus, resyncMemory, type MemorySyncStatus } from "../../api/client";
import { Icon } from "../primitives/Icon";

/**
 * Retrieval-index sync health. Quiet when everything's indexed; when items are
 * behind it offers a one-click re-sync (queues every unsynced item; the server
 * drains it in the background).
 */
export function MemorySync() {
  const [status, setStatus] = useState<MemorySyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => getMemoryStatus().then((r) => setStatus(r.status)).catch(() => setStatus(null));

  useEffect(() => {
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!status || !status.mirror_enabled || status.items === 0) return null;

  const behind = status.items - status.synced;
  const allSynced = behind <= 0 && status.pending === 0 && status.failed === 0;

  const resync = async () => {
    setBusy(true);
    try {
      const r = await resyncMemory();
      setStatus(r.status);
    } finally {
      setBusy(false);
      setTimeout(load, 4000);
    }
  };

  return (
    <div className="flex items-center gap-2 text-[length:var(--text-micro)] text-faint">
      <Icon name={allSynced ? "check" : "arrowRight"} size={12} className={allSynced ? "text-good" : ""} />
      {allSynced ? (
        <span>{status.synced} indexed for retrieval</span>
      ) : (
        <>
          <span title={status.recent_errors[0] ?? undefined}>
            {status.synced}/{status.items} indexed
            {status.pending > 0 ? ` · ${status.pending} syncing` : ""}
            {status.failed > 0 ? ` · ${status.failed} failed` : ""}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={resync}
            className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-muted underline-offset-2 transition-colors hover:bg-hover hover:text-text disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Re-sync"}
          </button>
        </>
      )}
    </div>
  );
}
