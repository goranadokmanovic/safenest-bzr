/** Soft gold bokeh orbs — ambient luxury accent, never overlaps UI content. */
export function SoftOrbs({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bzr-orbs pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`.trim()}
      aria-hidden
    >
      <span className="bzr-orb bzr-orb-a" />
      <span className="bzr-orb bzr-orb-b" />
      <span className="bzr-orb bzr-orb-c" />
    </div>
  );
}
