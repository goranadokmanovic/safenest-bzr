"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  IMPORT_FILE_ACCEPT,
  SpreadsheetParseError,
  parseSpreadsheetFile,
  warmSpreadsheetParser,
} from "@/lib/import/parse-sheet";
import {
  autoDetectMapping,
  mapRows,
  validRows,
} from "@/lib/import/map-rows";
import type {
  ColumnMapping,
  ImportField,
  ParsedSheet,
  ParsedWorkbook,
} from "@/lib/import/types";

const PREVIEW_ROWS = 8;

export type ImportResult = { imported: number; error?: string };

type Props<K extends string> = {
  open: boolean;
  title: string;
  fields: ImportField<K>[];
  /** Polja koja čine identitet reda — duplikati u fajlu se preskaču. */
  dedupeKeys?: K[];
  onClose: () => void;
  onImport: (rows: Record<K, string | null>[]) => Promise<ImportResult>;
};

/**
 * Generički dijalog za uvoz tabela: fajl → mapiranje kolona → pregled → uvoz.
 * Ne zna ništa o entitetu; ponašanje definišu `fields` i `onImport`.
 */
export function SpreadsheetImportDialog<K extends string>({
  open,
  title,
  fields,
  dedupeKeys,
  onClose,
  onImport,
}: Props<K>) {
  const { m } = useTranslations();
  const t = m.dataImport;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping<K> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const messages = useMemo(
    () => ({
      required: t.errRequired,
      invalidDate: t.errInvalidDate,
      tooLong: t.errTooLong,
      duplicate: t.errDuplicate,
    }),
    [t],
  );

  const reset = useCallback(() => {
    setWorkbook(null);
    setSheetIndex(0);
    setMapping(null);
    setParsing(false);
    setImporting(false);
    setError(null);
    setDone(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* Parser chunk se dovlači na otvaranje dijaloga (radi i offline). */
  useEffect(() => {
    if (open) warmSpreadsheetParser();
  }, [open]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, importing, onClose]);

  const sheet: ParsedSheet | null = workbook?.sheets[sheetIndex] ?? null;

  const result = useMemo(() => {
    if (!sheet || !mapping) return null;
    return mapRows(sheet, fields, mapping, messages, { dedupeKeys });
  }, [sheet, mapping, fields, messages, dedupeKeys]);

  const missingRequired = useMemo(
    () =>
      fields
        .filter(
          (f) => f.required && (mapping?.[f.key] === null || mapping?.[f.key] === undefined),
        )
        .map((f) => f.label),
    [fields, mapping],
  );

  function parseErrorMessage(err: unknown): string {
    if (err instanceof SpreadsheetParseError) {
      if (err.code === "UNSUPPORTED") return t.errUnsupported;
      if (err.code === "TOO_LARGE") return t.errTooLarge;
      if (err.code === "EMPTY") return t.errEmpty;
      return t.errParseFailed;
    }
    return t.errParseFailed;
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    setParsing(true);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setWorkbook(parsed);
      setSheetIndex(0);
      setMapping(autoDetectMapping(parsed.sheets[0]!.headers, fields));
    } catch (err) {
      setWorkbook(null);
      setMapping(null);
      setError(parseErrorMessage(err));
    } finally {
      setParsing(false);
    }
  }

  function selectSheet(index: number) {
    if (!workbook) return;
    const next = workbook.sheets[index];
    if (!next) return;
    setSheetIndex(index);
    setMapping(autoDetectMapping(next.headers, fields));
  }

  function setFieldColumn(key: K, rawValue: string) {
    setMapping((prev) => {
      if (!prev) return prev;
      const col = rawValue === "" ? null : Number(rawValue);
      const next = { ...prev, [key]: col } as ColumnMapping<K>;
      /* Jedna kolona ne može da puni dva polja. */
      if (col !== null) {
        for (const field of fields) {
          if (field.key !== key && next[field.key] === col) {
            next[field.key] = null;
          }
        }
      }
      return next;
    });
  }

  async function runImport() {
    if (!result) return;
    const rows = validRows(result).map((row) => row.values);
    if (rows.length === 0) {
      setError(t.nothingToImport);
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const outcome = await onImport(rows);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setDone(outcome.imported);
    } catch {
      setError(m.common.networkError);
    } finally {
      setImporting(false);
    }
  }

  if (!open || !mounted) return null;

  const previewRows = result?.rows.slice(0, PREVIEW_ROWS) ?? [];
  const hiddenRows = Math.max((result?.rows.length ?? 0) - PREVIEW_ROWS, 0);
  const readyCount = result?.validCount ?? 0;
  const canImport =
    !!result && readyCount > 0 && missingRequired.length === 0 && !importing;

  /* Portal: overlay ne sme da zavisi od transformisanih/overflow predaka
     (npr. red tabele klijenata koji se skalira na hover). */
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-overlay/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="my-8 w-full max-w-4xl rounded-xl border border-border/40 bg-surface p-5 shadow-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">
              {title}
            </h3>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-accent-muted">
              {workbook ? t.step2 : t.step1}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-lg border border-border/40 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {m.common.cancel}
          </button>
        </div>

        {done !== null ? (
          <div className="mt-6">
            <p className="text-sm font-semibold text-ink">
              {t.imported.replace("{count}", String(done))}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bzr-btn-primary !px-4 !py-1.5"
              >
                {m.common.save}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-border/40 px-4 py-1.5 text-sm"
              >
                {t.changeFile}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!workbook ? (
              <div className="mt-5">
                <p className="text-sm text-ink/75">{t.fileHint}</p>
                <label
                  htmlFor="bzr-import-file"
                  className="bzr-btn-primary mt-4 inline-flex cursor-pointer !px-4 !py-1.5"
                >
                  {parsing ? t.parsing : t.chooseFile}
                </label>
                <input
                  id="bzr-import-file"
                  ref={fileInputRef}
                  type="file"
                  accept={IMPORT_FILE_ACCEPT}
                  onChange={(e) => void onFileChange(e)}
                  disabled={parsing}
                  className="sr-only"
                />
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-ink/80">{workbook.fileName}</p>
                  {workbook.sheets.length > 1 ? (
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-ink/70">{t.sheet}</span>
                      <select
                        value={sheetIndex}
                        onChange={(e) => selectSheet(Number(e.target.value))}
                        className="bzr-input !w-auto !rounded-lg !px-2 !py-1"
                      >
                        {workbook.sheets.map((s, i) => (
                          <option key={s.name} value={i}>
                            {s.name} ({s.rows.length})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-lg border border-border/40 px-3 py-1 text-xs"
                  >
                    {t.changeFile}
                  </button>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-ink">
                    {t.mapColumns}
                  </h4>
                  <p className="mt-1 text-xs text-ink/65">{t.mapHint}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {fields.map((field) => (
                      <div key={field.key}>
                        <label
                          htmlFor={`bzr-map-${field.key}`}
                          className="block text-xs font-medium"
                        >
                          {field.label}
                          {field.required ? (
                            <span className="ml-1 text-accent">
                              ({t.required})
                            </span>
                          ) : null}
                        </label>
                        <select
                          id={`bzr-map-${field.key}`}
                          value={mapping?.[field.key] ?? ""}
                          onChange={(e) =>
                            setFieldColumn(field.key, e.target.value)
                          }
                          className="bzr-input mt-1 !rounded-lg !px-2 !py-1.5"
                        >
                          <option value="">{t.ignoreColumn}</option>
                          {(sheet?.headers ?? []).map((header, i) => (
                            <option key={`${header}-${i}`} value={i}>
                              {header || `${t.columnLabel} ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-ink">{t.preview}</h4>
                  <div className="bzr-table-wrap mt-2">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr>
                          <th className="w-16">#</th>
                          {fields.map((field) => (
                            <th key={field.key}>{field.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={
                              row.errors.length > 0
                                ? "opacity-60"
                                : row.warnings.length > 0
                                  ? "bg-warning/[0.07]"
                                  : undefined
                            }
                          >
                            <td className="text-ink/60">{row.rowNumber}</td>
                            {fields.map((field) => (
                              <td key={field.key} className="break-words">
                                {row.values[field.key] ?? "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hiddenRows > 0 ? (
                    <p className="mt-2 text-xs text-ink/60">
                      {t.moreRows.replace("{count}", String(hiddenRows))}
                    </p>
                  ) : null}

                  {previewRows.some((row) => row.errors.length > 0) ? (
                    <ul className="mt-3 space-y-1 text-xs text-red-700">
                      {previewRows
                        .filter((row) => row.errors.length > 0)
                        .map((row) => (
                          <li key={row.rowNumber}>
                            {t.rowLabel.replace("{row}", String(row.rowNumber))}
                            : {row.errors.join("; ")}
                          </li>
                        ))}
                    </ul>
                  ) : null}

                  {previewRows.some(
                    (row) => row.errors.length === 0 && row.warnings.length > 0,
                  ) ? (
                    <ul className="mt-3 space-y-1 text-xs text-warning">
                      {previewRows
                        .filter(
                          (row) =>
                            row.errors.length === 0 && row.warnings.length > 0,
                        )
                        .map((row) => (
                          <li key={row.rowNumber}>
                            {t.rowLabel.replace("{row}", String(row.rowNumber))}
                            : {row.warnings.join("; ")}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink/75">
                  <span className="font-semibold text-ink">
                    {t.summaryValid.replace("{count}", String(readyCount))}
                  </span>
                  {result && result.invalidCount > 0 ? (
                    <span>
                      {t.summaryInvalid.replace(
                        "{count}",
                        String(result.invalidCount),
                      )}
                    </span>
                  ) : null}
                  {result && result.duplicateCount > 0 ? (
                    <span>
                      {t.summaryDuplicate.replace(
                        "{count}",
                        String(result.duplicateCount),
                      )}
                    </span>
                  ) : null}
                  {result && result.warningCount > 0 ? (
                    <span className="text-warning">
                      {t.summaryWarning.replace(
                        "{count}",
                        String(result.warningCount),
                      )}
                    </span>
                  ) : null}
                </div>

                {missingRequired.length > 0 ? (
                  <p className="text-sm text-red-700">
                    {t.missingRequired.replace(
                      "{fields}",
                      missingRequired.join(", "),
                    )}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canImport}
                    onClick={() => void runImport()}
                    className="bzr-btn-primary !px-4 !py-1.5 disabled:opacity-50"
                  >
                    {importing
                      ? t.importing
                      : t.importButton.replace("{count}", String(readyCount))}
                  </button>
                </div>
              </div>
            )}

            {error ? (
              <p className="mt-4 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
