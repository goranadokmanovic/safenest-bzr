"use client";

import { useTranslations } from "@/components/i18n/locale-provider";
import type { RiskLevel } from "@/lib/field-visits/display";

const STYLES: Record<RiskLevel, string> = {
  low: "bzr-badge-success",
  medium: "bzr-badge-warning",
  high: "bzr-badge-danger",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const label =
    level === "low"
      ? fv.riskLow
      : level === "medium"
        ? fv.riskMedium
        : fv.riskHigh;

  return (
    <span className={STYLES[level]}>
      <span aria-hidden className="text-[0.55rem] leading-none">
        ●
      </span>
      {label}
    </span>
  );
}
