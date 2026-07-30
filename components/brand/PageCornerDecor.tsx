import { BrandDecor } from "@/components/brand/BrandDecor";
import { PageCanvasDecor } from "@/components/brand/PageCanvasDecor";

type DecoKind =
  | "halftone"
  | "dots-ring"
  | "dots-spiral"
  | "steps-a"
  | "steps-b"
  | "megaphone";

type Corner = "br" | "bl" | "tr" | "tl";

/** Graphic motifs stay small and tucked — atmosphere only. */
const GRAPHIC: ReadonlySet<DecoKind> = new Set([
  "steps-a",
  "steps-b",
  "megaphone",
]);

const COMPANION: Record<DecoKind, DecoKind> = {
  halftone: "dots-ring",
  "dots-ring": "halftone",
  "dots-spiral": "steps-a",
  "steps-a": "dots-spiral",
  "steps-b": "dots-ring",
  megaphone: "halftone",
};

const CORNER: Record<Corner, string> = {
  br: "!absolute -bottom-[10%] -right-[12%] sm:-bottom-[7%] sm:-right-[8%] !rotate-[42deg]",
  bl: "!absolute -bottom-[10%] -left-[12%] sm:-bottom-[7%] sm:-left-[8%] !-rotate-[42deg]",
  tr: "!absolute -top-[12%] -right-[12%] sm:-top-[8%] sm:-right-[8%] !-rotate-[42deg]",
  tl: "!absolute -top-[12%] -left-[12%] sm:-top-[8%] sm:-left-[8%] !rotate-[42deg]",
};

const CORNER_GRAPHIC: Record<Corner, string> = {
  br: "!absolute -bottom-3 -right-4 sm:bottom-2 sm:right-2 !rotate-[8deg]",
  bl: "!absolute -bottom-3 -left-4 sm:bottom-2 sm:left-2 !-rotate-[8deg]",
  tr: "!absolute -top-3 -right-4 sm:top-2 sm:right-2 !-rotate-[8deg]",
  tl: "!absolute -top-3 -left-4 sm:top-2 sm:left-2 !rotate-[8deg]",
};

/**
 * Premium corner composition, or a single full-canvas motif.
 *
 * Canvas mode (see .cursor/rules/bzr-page-decor.mdc):
 * ONE asset over the whole content pane — textures cover, circles contain.
 */
export function PageCornerDecor({
  kind = "dots-ring",
  corner = "br",
  className = "",
  variant = "corner",
}: {
  kind?: DecoKind;
  corner?: Corner;
  className?: string;
  variant?: "corner" | "canvas";
}) {
  const isGraphic = GRAPHIC.has(kind);

  if (variant === "canvas") {
    return <PageCanvasDecor kind={kind} />;
  }

  return (
    <div
      className={`bzr-page-corner bzr-page-corner--${corner} pointer-events-none absolute inset-0 overflow-hidden`}
      aria-hidden
    >
      <span className="bzr-page-aura" />
      <BrandDecor
        kind={kind}
        layer="background"
        sizeClassName={
          isGraphic
            ? "h-44 w-44 sm:h-52 sm:w-52 lg:h-60 lg:w-60"
            : "h-64 w-64 sm:h-80 sm:w-80 lg:h-96 lg:w-96"
        }
        className={`bzr-page-motif ${isGraphic ? CORNER_GRAPHIC[corner] : CORNER[corner]} ${className}`.trim()}
      />
      <BrandDecor
        kind={COMPANION[kind]}
        layer="background"
        sizeClassName="h-24 w-24 sm:h-32 sm:w-32"
        className="bzr-page-companion"
      />
      <span className="bzr-page-glint bzr-page-glint--one" />
      <span className="bzr-page-glint bzr-page-glint--two" />
    </div>
  );
}
