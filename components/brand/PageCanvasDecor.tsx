"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type CanvasKind =
  | "halftone"
  | "dots-ring"
  | "dots-spiral"
  | "steps-a"
  | "steps-b"
  | "megaphone";

/**
 * Texture clouds → cover the pane (no letterbox seams).
 * Circular motifs → contain so the whole shape stays intact.
 */
const SRC: Record<CanvasKind, string> = {
  halftone: "/brand/deco-halftone.png",
  "dots-ring": "/brand/deco-dots-ring.png",
  "dots-spiral": "/brand/deco-dots-spiral-full.png",
  "steps-a": "/brand/deco-steps-a.png",
  "steps-b": "/brand/deco-steps-b.png",
  megaphone: "/brand/deco-megaphone.png",
};

const FILL: Record<CanvasKind, "cover" | "contain"> = {
  halftone: "cover",
  "dots-ring": "contain",
  "dots-spiral": "contain",
  "steps-a": "contain",
  "steps-b": "contain",
  megaphone: "contain",
};

/**
 * Full-page atmosphere motif, portaled to document.body.
 * See .cursor/rules/bzr-page-decor.mdc
 */
export function PageCanvasDecor({ kind }: { kind: CanvasKind }) {
  const [mounted, setMounted] = useState(false);
  const fill = FILL[kind];

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  /* Textures: CSS background-size:cover — more reliable than <img> letterboxing */
  if (fill === "cover") {
    return createPortal(
      <div
        className="bzr-page-canvas bzr-page-canvas--texture"
        aria-hidden
        style={{ backgroundImage: `url(${SRC[kind]})` }}
      />,
      document.body,
    );
  }

  return createPortal(
    <div className="bzr-page-canvas" aria-hidden>
      <img
        src={SRC[kind]}
        alt=""
        className={`bzr-page-canvas-img bzr-page-canvas-img--contain bzr-page-canvas-img--${kind}`}
        draggable={false}
      />
    </div>,
    document.body,
  );
}
