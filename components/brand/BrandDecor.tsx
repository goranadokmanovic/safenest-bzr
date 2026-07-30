type DecoKind =
  | "halftone"
  | "dots-ring"
  | "dots-spiral"
  | "steps-a"
  | "steps-b"
  | "megaphone";

const SRC: Record<DecoKind, string> = {
  halftone: "/brand/deco-halftone.png",
  "dots-ring": "/brand/deco-dots-ring.png",
  "dots-spiral": "/brand/deco-dots-spiral.png",
  "steps-a": "/brand/deco-steps-a.png",
  "steps-b": "/brand/deco-steps-b.png",
  megaphone: "/brand/deco-megaphone.png",
};

type BrandDecorProps = {
  kind: DecoKind;
  className?: string;
  sizeClassName?: string;
  /** background = behind content; accent = in reserved art slot; inline = flow */
  layer?: "background" | "accent" | "inline";
};

/** Brand motif — keep out of text/card borders; use reserved slots. */
export function BrandDecor({
  kind,
  className = "",
  sizeClassName = "h-64 w-64",
  layer = "accent",
}: BrandDecorProps) {
  const layerClass =
    layer === "background"
      ? "bzr-auth-deco bzr-deco-bg"
      : layer === "inline"
        ? "bzr-auth-deco bzr-deco-static"
        : "bzr-auth-deco";

  return (
    <div
      role="presentation"
      aria-hidden
      className={`pointer-events-none select-none bg-contain bg-center bg-no-repeat ${layerClass} ${sizeClassName} ${className}`.trim()}
      style={{ backgroundImage: `url('${SRC[kind]}')` }}
    />
  );
}
