import { cn } from "@/lib/utils";

/**
 * The CIP prism mark. One neutral ray enters the prism; the full brand
 * spectrum leaves — the product thesis (a brand refracted through many AI
 * models) as a single glyph. The triangle and entering ray follow
 * `currentColor` so the mark reads on any surface; the five refracted rays are
 * the fixed brand-spectrum stops (each also codes one AI model).
 */
export function CipMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 30 30"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path d="M15 5.5 L24.5 23 H5.5 Z" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.4" />
      <path d="M4 15 L11.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.5 14.6 L27 9.5" stroke="#ff5ca8" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.7 15.4 L27 13.5" stroke="#a878ff" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.8 16 L27 16.6" stroke="#5b8bff" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.7 16.7 L27 19.6" stroke="#29d3ec" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.5 17.2 L27 23" stroke="#38e0a1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
