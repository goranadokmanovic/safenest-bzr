import { randomBytes } from "crypto";

/** Nasumični URL-safe invite token (~32 znaka). */
export function generateInviteCode(): string {
  return randomBytes(24).toString("base64url");
}

export const INVITE_TTL_DAYS = 7;

export function inviteExpiresAt(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

export type InviteStatus = "active" | "used" | "expired";

export function resolveInviteStatus(invite: {
  used_at: string | null;
  expires_at: string;
  now?: Date;
}): InviteStatus {
  if (invite.used_at) return "used";
  const now = invite.now ?? new Date();
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}
