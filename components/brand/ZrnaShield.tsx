import Image from "next/image";

type ZrnaShieldProps = {
  size?: "sm" | "md" | "fab";
  className?: string;
};

/** Pixel heights; width follows cutout aspect (~1146×1372). */
const SIZE_H = { sm: 34, md: 42, fab: 104 } as const;
const ASPECT = 1146 / 1372;

/**
 * Brand shield for Zrna (public/zrna-shield.png).
 * Source: photos/Zrna sa stitom finalni.png → alpha cutout.
 */
export function ZrnaShield({ size = "md", className = "" }: ZrnaShieldProps) {
  const h = SIZE_H[size];
  const w = Math.round(h * ASPECT);

  return (
    <span
      className={["relative inline-flex shrink-0 bg-transparent", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: w, height: h }}
    >
      <Image
        src="/zrna-shield.png"
        alt="Zrna"
        width={w}
        height={h}
        className="h-full w-full bg-transparent object-contain"
        priority={size === "md" || size === "fab"}
      />
    </span>
  );
}
