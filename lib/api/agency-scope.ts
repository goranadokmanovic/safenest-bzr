import { NextResponse } from "next/server";
import type { AuthProfile } from "@/lib/api/session";
import { isSuperAdmin } from "@/lib/api/session";
import { jsonError } from "@/lib/api/responses";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Za list/filter: super_admin može proslediti ?agency_id=, inače svi klijenti (RLS).
 * Ostali: obavezno profile.agency_id.
 */
export function agencyFilterForList(
  profile: AuthProfile,
  queryAgencyId: string | null,
): { agencyId: string | null } | { error: NextResponse } {
  if (isSuperAdmin(profile)) {
    if (queryAgencyId) {
      if (!isUuid(queryAgencyId)) {
        return { error: jsonError("Nevažeći agency_id.", 400) };
      }
      return { agencyId: queryAgencyId };
    }
    return { agencyId: null };
  }
  if (!profile.agency_id) {
    return {
      error: jsonError("Niste dodeljeni agenciji.", 403),
    };
  }
  return { agencyId: profile.agency_id };
}

/**
 * Za upis: običan korisnik koristi profile.agency_id.
 * Super admin bez agencije mora poslati agency_id u telu.
 */
export function agencyIdForInsert(
  profile: AuthProfile,
  bodyAgencyId: string | undefined,
): { agencyId: string } | { error: NextResponse } {
  if (isSuperAdmin(profile)) {
    const id = bodyAgencyId ?? profile.agency_id;
    if (!id || !isUuid(id)) {
      return {
        error: jsonError("Polje agency_id je obavezno (super admin).", 400),
      };
    }
    return { agencyId: id };
  }
  if (!profile.agency_id) {
    return { error: jsonError("Niste dodeljeni agenciji.", 403) };
  }
  return { agencyId: profile.agency_id };
}
