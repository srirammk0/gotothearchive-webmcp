import type { CSSProperties } from "react";
import {
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  Hammer,
  Link,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon set for the whole product — Lucide, referenced by our own stable
 * names so call sites never import from lucide-react directly.
 */
const ICONS = {
  arrowRight: ArrowRight,
  arrowUpLeft: ArrowUpLeft,
  arrowUpRight: ArrowUpRight,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  check: Check,
  close: X,
  dots: MoreHorizontal,
  expand: Maximize2,
  file: File,
  folder: Folder,
  link: Link,
  pencil: Pencil,
  pin: Pin,
  plus: Plus,
  search: Search,
  sparkle: Sparkles,
  trash: Trash2,
  bolt: Zap,
  wrench: Hammer,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Glyph = ICONS[name];
  return <Glyph size={size} className={className} style={style} strokeWidth={2} aria-hidden="true" />;
}
