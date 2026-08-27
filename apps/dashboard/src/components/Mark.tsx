/**
 * Workk mark — a geometric W monogram in gold on a rounded ink tile.
 * Shared so the sidebar, admin console, auth screens and invoices all show the
 * same logo. `className` sizes the tile; the W scales with it.
 */
export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`grid ${className} shrink-0 place-items-center rounded-[30%] bg-ink`}>
      <svg
        viewBox="0 0 24 24"
        className="h-[56%] w-[56%] text-amber-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 6.5 L7.5 17.5 L12 9.5 L16.5 17.5 L20 6.5" />
      </svg>
    </span>
  );
}
