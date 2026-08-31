export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-hairline border-t-ink motion-reduce:animate-none"
      />
      <span className="font-sans text-[length:var(--text-meta)] text-stone">{label}</span>
    </span>
  );
}
