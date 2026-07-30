"use client";

import { useTranslations } from "@/components/i18n/locale-provider";

type Props = {
  values: string[];
  onChange: (values: string[]) => void;
  idPrefix?: string;
};

export function OperationAddressesField({
  values,
  onChange,
  idPrefix = "op-addr",
}: Props) {
  const { m } = useTranslations();
  const c = m.admin.clients;

  function updateAt(index: number, value: string) {
    const next = [...values];
    next[index] = value;
    onChange(next);
  }

  function addRow() {
    onChange([...values, ""]);
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  const rows = values.length > 0 ? values : [""];

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium">{c.operationAddresses}</span>
      {rows.map((value, index) => (
        <div key={`${idPrefix}-${index}`} className="flex gap-2">
          <input
            id={`${idPrefix}-${index}`}
            value={value}
            onChange={(e) => updateAt(index, e.target.value)}
            placeholder={`${c.operationAddresses} ${index + 1}`}
            className="bzr-input min-w-0 flex-1 !rounded-lg !px-2 !py-1.5"
          />
          {rows.length > 1 || value ? (
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="rounded-lg border border-border/40 px-2 py-1 text-xs"
            >
              {c.removeOperationAddress}
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="rounded-lg border border-border/40 px-2 py-1 text-xs"
      >
        {c.addOperationAddress}
      </button>
    </div>
  );
}

export function formatOperationAddressesSummary(
  addresses: string[] | null | undefined,
  emptyLabel: string,
): string {
  const list = (addresses ?? []).filter(Boolean);
  if (list.length === 0) return emptyLabel;
  if (list.length === 1) return list[0]!;
  return `${list[0]} (+${list.length - 1})`;
}

export function parseOperationAddresses(
  raw: unknown,
): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}
