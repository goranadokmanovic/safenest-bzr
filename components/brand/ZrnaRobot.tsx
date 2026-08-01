import Image from "next/image";

type ZrnaRobotProps = {
  size?: "sm" | "md";
  className?: string;
};

/** Pixel heights; width follows cutout aspect (~1024×1689). */
const SIZE_H = { sm: 176, md: 252 } as const;
const ASPECT = 1024 / 1689;

/**
 * Zrna robot mascot (public/zrna-robot.png).
 * Decorative companion beside the open chat panel.
 */
export function ZrnaRobot({ size = "md", className = "" }: ZrnaRobotProps) {
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
        src="/zrna-robot.png"
        alt=""
        width={w}
        height={h}
        className="h-full w-full bg-transparent object-contain"
        priority={size === "md"}
      />
    </span>
  );
}
