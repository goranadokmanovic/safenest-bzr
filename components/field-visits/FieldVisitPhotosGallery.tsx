"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import { getPhotosForLocalVisit } from "@/lib/offline/photos";
import type { FieldVisitPhotoDisplay } from "@/lib/field-visits/types";

type Props = {
  /** Server poseta — fotografije sa stranice ili GET /api/field-photos. */
  serverPhotos?: FieldVisitPhotoDisplay[];
  /** Lokalna (offline) poseta — učitava Blob iz IndexedDB. */
  localVisitId?: string;
};

function formatExtractedDates(
  extracted: Record<string, unknown> | null,
): string | null {
  if (!extracted) return null;
  const dates = extracted.dates;
  if (!Array.isArray(dates) || dates.length === 0) return null;
  return dates.map(String).join(", ");
}

export function FieldVisitPhotosGallery({
  serverPhotos,
  localVisitId,
}: Props) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const [localPhotos, setLocalPhotos] = useState<FieldVisitPhotoDisplay[]>([]);

  useEffect(() => {
    if (!localVisitId) {
      setLocalPhotos([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const records = await getPhotosForLocalVisit(localVisitId);
      if (cancelled) return;

      const mapped: FieldVisitPhotoDisplay[] = records.map((r) => ({
        id: r.id,
        label: r.data.filename,
        url: URL.createObjectURL(r.data.blob),
        ocr_text: r.data.ocr_text,
        ocr_confidence: r.data.ocr_confidence ?? null,
        extracted_dates: null,
        pendingUpload: !r.synced,
      }));
      setLocalPhotos(mapped);
    })();

    return () => {
      cancelled = true;
      setLocalPhotos((prev) => {
        for (const p of prev) {
          if (p.url.startsWith("blob:")) URL.revokeObjectURL(p.url);
        }
        return [];
      });
    };
  }, [localVisitId]);

  const photos = useMemo(() => {
    if (localVisitId) return localPhotos;
    return serverPhotos ?? [];
  }, [localVisitId, localPhotos, serverPhotos]);

  if (photos.length === 0) {
    return <p className="mt-1 text-xs text-ink/60">{fv.noPhotos}</p>;
  }

  return (
    <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => {
        const datesLabel = formatExtractedDates(photo.extracted_dates);
        return (
          <li
            key={photo.id}
            className="overflow-hidden rounded border border-ink/20 bg-ink/[0.02]"
          >
            <a
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.label}
                className="aspect-square w-full object-cover"
              />
            </a>
            <div className="space-y-1 p-2 text-xs">
              <p className="truncate font-medium" title={photo.label}>
                {photo.label}
              </p>
              {photo.pendingUpload ? (
                <p className="text-warning">{fv.photoPendingUpload}</p>
              ) : null}
              {photo.ocr_confidence != null ? (
                <p className="text-ink/60">
                  {fv.photoOcrConfidence.replace(
                    "{value}",
                    String(photo.ocr_confidence),
                  )}
                </p>
              ) : null}
              {datesLabel ? (
                <p className="text-ink/70">
                  {fv.photoExtractedDates}: {datesLabel}
                </p>
              ) : null}
              {photo.ocr_text ? (
                <p className="line-clamp-3 whitespace-pre-wrap text-ink/70">
                  {photo.ocr_text}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
