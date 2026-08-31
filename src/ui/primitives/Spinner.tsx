export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent motion-reduce:animate-none"
      />
      <span className="text-[length:var(--text-meta)] text-muted">{label}</span>
    </span>
  );
}
