/** Identifikatori planova u bazi, Stripe metadata i checkout telu. */
export type AgencyPlanId = "agency_basic" | "agency_l" | "agency_xl";

export type AgencyPlanDef = {
  id: AgencyPlanId;
  /** Prikaz ime */
  nameSr: string;
  nameEn: string;
  /** Kratak opis (agencija + agenti) */
  descriptionSr: string;
  /** Maks. korisnika agencije koji broje za naplatu: vlasnik + agenti (LZS/teren/saradnik). null = neograničeno. */
  maxBillableSeats: number | null;
};

/**
 * Basic: vlasnik + 2 agenta = 3 mesta.
 * L: vlasnik + 8 agenata = 9 mesta.
 * XL: neograničeno.
 * Cene se ne držav ovde — vuku se iz Stripe Price preko API-ja `/api/stripe/plan-prices`.
 */
export const AGENCY_PLANS: readonly AgencyPlanDef[] = [
  {
    id: "agency_basic",
    nameSr: "Osnovni",
    nameEn: "Basic",
    descriptionSr: "Agencija + do 2 agenta (ukupno 3 korisnika)",
    maxBillableSeats: 3,
  },
  {
    id: "agency_l",
    nameSr: "L",
    nameEn: "L",
    descriptionSr: "Agencija + do 8 agenata (ukupno 9 korisnika)",
    maxBillableSeats: 9,
  },
  {
    id: "agency_xl",
    nameSr: "XL",
    nameEn: "XL",
    descriptionSr: "Agencija + neograničeno korisnika",
    maxBillableSeats: null,
  },
] as const;

export const AGENCY_PLAN_IDS = AGENCY_PLANS.map((p) => p.id) as [
  AgencyPlanId,
  AgencyPlanId,
  AgencyPlanId,
];

export function getPlanById(id: string | null | undefined): AgencyPlanDef | null {
  if (!id) return null;
  const normalized = id === "starter" ? "agency_basic" : id;
  return AGENCY_PLANS.find((p) => p.id === normalized) ?? null;
}

export function maxSeatsForPlanTier(
  tier: string | null | undefined,
): number | null {
  const plan = getPlanById(tier);
  return plan?.maxBillableSeats ?? null;
}
