/**
 * Tip terenske posete (visit_type) — klasifikacija u UI/kalendaru.
 * Broj naloga i dalje vođen isključivo preko parent_visit_id (kontrolna).
 */

export const VISIT_TYPES = [
  "initial",
  "periodic",
  "control",
  "extraordinary",
  "advisory",
] as const;

export type VisitType = (typeof VISIT_TYPES)[number];

/** Redosled u dropdown-u. */
export const VISIT_TYPE_ORDER: readonly VisitType[] = VISIT_TYPES;

export const DEFAULT_VISIT_TYPE: VisitType = "periodic";

export function isVisitType(value: unknown): value is VisitType {
  return (
    typeof value === "string" &&
    (VISIT_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeVisitType(
  value: unknown,
  fallback: VisitType = DEFAULT_VISIT_TYPE,
): VisitType {
  return isVisitType(value) ? value : fallback;
}

export function visitTypeLabel(
  type: VisitType,
  locale: "sr" | "en" = "sr",
): string {
  if (locale === "en") {
    switch (type) {
      case "initial":
        return "Initial visit";
      case "periodic":
        return "Periodic visit";
      case "control":
        return "Follow-up visit";
      case "extraordinary":
        return "Extraordinary visit";
      case "advisory":
        return "Advisory visit";
      default:
        return type;
    }
  }
  switch (type) {
    case "initial":
      return "Prva poseta";
    case "periodic":
      return "Periodična poseta";
    case "control":
      return "Kontrolna poseta";
    case "extraordinary":
      return "Vanredna poseta";
    case "advisory":
      return "Savetodavna poseta";
    default:
      return type;
  }
}

/**
 * Usklađuje tip i roditelja:
 * - control ⇒ parent obavezan
 * - non-control ⇒ parent mora biti null
 */
export function resolveVisitTypeAndParent(input: {
  visitType: VisitType | null | undefined;
  parentVisitId: string | null | undefined;
}):
  | { ok: true; visit_type: VisitType; parent_visit_id: string | null }
  | { ok: false; message: string } {
  let visitType = normalizeVisitType(input.visitType);
  const parent =
    typeof input.parentVisitId === "string" && input.parentVisitId.trim()
      ? input.parentVisitId.trim()
      : null;

  // Ako je izabran roditelj a tip nije control — forsira control.
  if (parent && visitType !== "control") {
    visitType = "control";
  }

  if (visitType === "control" && !parent) {
    return {
      ok: false,
      message:
        "Za kontrolnu posetu je obavezan izbor originalnog naloga (parent_visit_id).",
    };
  }

  if (visitType !== "control" && parent) {
    return {
      ok: false,
      message:
        "parent_visit_id je dozvoljen samo za tip posete „kontrolna”.",
    };
  }

  return { ok: true, visit_type: visitType, parent_visit_id: parent };
}
