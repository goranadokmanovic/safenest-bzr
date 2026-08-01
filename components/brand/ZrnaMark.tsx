type ZrnaMarkProps = {
  size?: "sm" | "md";
  className?: string;
  /** Decorative next to text; set false when the control already has an accessible name. */
  decorative?: boolean;
};

const SIZE_PX = { sm: 28, md: 36 } as const;

/**
 * Z-orbit monogram for the Zrna assistant — gold Z + orbital arc on dark plate.
 * Matches BrandLogo plate language (#141211, accent ring).
 */
export function ZrnaMark({
  size = "md",
  className = "",
  decorative = true,
}: ZrnaMarkProps) {
  const px = SIZE_PX[size];

  return (
    <span
      className={[
        "bzr-zrna-mark",
        size === "sm" ? "bzr-zrna-mark--sm" : "bzr-zrna-mark--md",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: px, height: px }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Zrna"}
    >
      <svg
        viewBox="0 0 40 40"
        width={px}
        height={px}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        {/* Soft halftone hint — three dots along upper arc */}
        <circle cx="12.5" cy="9.5" r="1.05" className="bzr-zrna-mark__dot" />
        <circle cx="20" cy="7.2" r="1.15" className="bzr-zrna-mark__dot" />
        <circle cx="27.5" cy="9.5" r="1.05" className="bzr-zrna-mark__dot" />

        {/* Orbital arc (open ring under / around Z) */}
        <path
          d="M8.5 22.5c1.2 6.2 6.4 10.5 11.5 10.5s10.3-4.3 11.5-10.5"
          className="bzr-zrna-mark__orbit"
          strokeWidth="1.65"
          strokeLinecap="round"
        />
        {/* Small orbit node */}
        <circle cx="31.2" cy="21.2" r="1.35" className="bzr-zrna-mark__node" />

        {/* Geometric Z */}
        <path
          d="M13.2 14.2h13.6l-11.2 11.6h11.4"
          className="bzr-zrna-mark__z"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
