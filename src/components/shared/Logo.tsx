import { cn } from "@/lib/utils";

/**
 * The Probook mark: a P with a check rising out of it.
 *
 * Same idea as the mark it replaces, drawn flat. The old one was a navy-to-mint
 * gradient PNG — one fixed image asked to sit on a dark rail, a white page and
 * a warm card, and it never suited all three. This inherits `currentColor`, so
 * it is petrol on paper and pale on the rail without shipping a second file.
 *
 * The check is cut out of the P rather than laid over it, which is what keeps
 * the two shapes readable as two shapes in a single colour — down to 18 px,
 * where the letter still reads as a P.
 *
 * Every coordinate sits at least half a stroke width inside the 32×32 box. A
 * round cap adds that half-width in every direction around its end point, so a
 * check ending at x=30 under a 5-wide stroke actually reaches 32.5 and loses
 * its tip to the viewBox edge.
 */

/** Outer outline then counter; `fillRule="evenodd"` makes the counter a hole. */
const P = "M5 2 H16 A8.5 8.5 0 0 1 16 19 H11.5 V30 H5 Z M11.5 8 H16 A2.5 2.5 0 0 1 16 13 H11.5 Z";
const CHECK = "M14 21 L19 26 L29 9";

export function Logo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0 text-primary-600 dark:text-primary-400", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {/* The gap between the two shapes: the check stroked fatter, punched out
          of the letter. Without it the shapes fuse wherever they touch. */}
      <mask id="probook-mark-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="white" />
        <path
          d={CHECK}
          stroke="black"
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>

      <path d={P} fill="currentColor" fillRule="evenodd" mask="url(#probook-mark-cut)" />
      <path
        d={CHECK}
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
