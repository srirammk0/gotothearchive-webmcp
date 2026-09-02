import { useEffect, useState } from "react";
import { getMemoryStatus, type MemorySyncStatus } from "../../api/client";

type SyncState = "failed" | "syncing" | "idle";

const DOT: Record<SyncState, string> = { failed: "bg-bad", syncing: "bg-faint", idle: "bg-good" };
const LABEL: Record<SyncState, string> = { failed: "Failed to sync", syncing: "Syncing", idle: "Not synced" };

/** Retrieval-index sync health, at a glance: failed (red), syncing (gray), idle (green). */
export function MemorySync() {
  const [status, setStatus] = useState<MemorySyncStatus | null>(null);

  useEffect(() => {
    const load = () => getMemoryStatus().then((r) => setStatus(r.status)).catch(() => setStatus(null));
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!status || !status.mirror_enabled || status.items === 0) return null;

  const state: SyncState = status.failed > 0 ? "failed" : status.pending > 0 ? "syncing" : "idle";

  return (
    <div
      className="flex items-center gap-1.5 text-micro text-faint"
      title={state === "failed" ? status.recent_errors[0] : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} aria-hidden="true" />
      {LABEL[state]}
    </div>
  );
}
