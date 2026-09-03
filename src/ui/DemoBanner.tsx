/**
 * The strip a judge sees on every demo page. The demo is one archive shared by
 * every visitor with no sign-in, so the two things it has to say are "everyone
 * here sees what you do" and "none of this is real data". One line, in the same
 * accent the "Agent" label uses.
 */
export function DemoBanner() {
  return (
    <div className="border-b border-accent/20 bg-accent/15 text-accent">
      <div className="mx-auto flex h-8 max-w-[1440px] items-center gap-3 px-5 sm:px-8">
        <p className="flex-1 truncate text-micro">
          Shared demo archive — everyone here sees your changes, and none of it is
          real personal data.{" "}
          <a
            href="https://github.com/srirammk0/gotothearchive-webmcp/blob/main/docs/judges.md"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 transition-opacity duration-[var(--duration-fast)] hover:opacity-70"
          >
            How the demo works
          </a>
        </p>
      </div>
    </div>
  );
}
