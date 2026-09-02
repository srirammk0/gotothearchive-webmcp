import type { ReactNode } from "react";

/** The one quiet line shown when a section has nothing in it. */
export function EmptyRow({ children = "Nothing here yet" }: { children?: ReactNode }) {
  return <p className="py-10 text-center text-meta text-faint">{children}</p>;
}
