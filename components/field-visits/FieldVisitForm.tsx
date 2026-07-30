"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useMounted } from "@/hooks/useMounted";
import { getReferenceData, getRecords } from "@/lib/offline/indexedDB";
import { extractTextFromImage } from "@/lib/offline/ocr";
import { addFieldPhoto } from "@/lib/offline/photos";
import { addFieldAudio } from "@/lib/offline/audio";
import type { OfflineRecord } from "@/lib/offline/types";

import type { FieldVisitInsertPayload } from "@/lib/field-visits/types";
import { formatVisitDate } from "@/lib/field-visits/display";
import { SyncFailedNotice } from "@/components/offline/SyncFailedNotice";
import { useTranslations } from "@/components/i18n/locale-provider";
import { useRouter } from "next/navigation";

type ClientOption = { id: string; name: string };
type TemplateOption = { id: string; name: string; is_default: boolean };

type RiskLevel = "low" | "medium" | "high";
type NoiseMode = "quiet" | "noisy";

type CapturedPhoto = {
  id: string;
  file: File;
  preview: string;
  ocrText: string;
  ocrConfidence: number | null;
  ocrRunning: boolean;
};

type RecordedAudio = {
  blob: Blob;
  previewUrl: string;
  filename: string;
  durationSeconds: number;
};

type FieldVisitData = FieldVisitInsertPayload;

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function cameraFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `camera-${ts}.jpg`;
}

function supportedAudioMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function audioFilename(mimeType: string): string {
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `field-note-${ts}.${extension}`;
}

function formatRecordingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function FieldVisitForm() {
  const { m, locale } = useTranslations();
  const router = useRouter();
  const ff = m.dashboard.fieldVisits.form;
  const fv = m.dashboard.fieldVisits;

  const { isOnline, isSyncing, pending, syncData, addToQueue } =
    useOfflineSync();
  const mounted = useMounted();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [reportTemplateId, setReportTemplateId] = useState("");
  const [clientId, setClientId] = useState("");
  const [visitDate, setVisitDate] = useState(nowLocalInput);
  const [durationHours, setDurationHours] = useState("");
  const [notes, setNotes] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");
  const [hitnoOtklanjanje, setHitnoOtklanjanje] = useState(false);

  type ParentCandidate = {
    id: string;
    broj_naloga: string;
    scheduled_at: string | null;
    client_name: string | null;
    assigned_user_name: string | null;
    is_delegated: boolean;
    is_control: boolean;
  };
  const [parentQuery, setParentQuery] = useState("");
  const [parentCandidates, setParentCandidates] = useState<ParentCandidate[]>(
    [],
  );
  const [parentSearchLoading, setParentSearchLoading] = useState(false);
  const [selectedParent, setSelectedParent] = useState<ParentCandidate | null>(
    null,
  );
  const [predictedBroj, setPredictedBroj] = useState<string | null>(null);

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [noiseMode, setNoiseMode] = useState<NoiseMode>("quiet");
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPreviewUrlRef = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  // Sinhrona zaštita od duplog submit-a (pre nego što React state stigne da se ažurira).
  const savingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  // Prikazuje upadljivu potvrdu uspešnog čuvanja duže vreme, da se ne klikne ponovo iz nesigurnosti.
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState<OfflineRecord<FieldVisitData>[]>([]);

  const ocrRunning = photos.some((p) => p.ocrRunning);

  const refreshSaved = useCallback(async () => {
    const rows = await getRecords<FieldVisitData>("field_visits");
    setSaved(rows);
  }, []);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved, pending, isSyncing]);

  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioPreviewUrlRef.current) {
        URL.revokeObjectURL(audioPreviewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = await getReferenceData<{ id: string; name?: string }>(
          "client_companies",
        );
        if (!cancelled && local.length > 0) {
          setClients(
            local.map((c) => ({ id: c.id, name: c.name ?? ff.noClientName })),
          );
          return;
        }
      } catch {
        /* IndexedDB nedostupan */
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const res = await fetch("/api/clients");
        if (!res.ok) return;
        const json = (await res.json()) as {
          clients?: Array<{ id: string; name?: string }>;
        };
        if (!cancelled && json.clients) {
          setClients(
            json.clients.map((c) => ({
              id: c.id,
              name: c.name ?? ff.noClientName,
            })),
          );
        }
      } catch {
        /* offline ili greška */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ff.noClientName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTemplatesLoading(true);
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (!cancelled) setTemplatesLoading(false);
          return;
        }
        const res = await fetch("/api/report-templates");
        if (!res.ok) {
          if (!cancelled) setTemplatesLoading(false);
          return;
        }
        const json = (await res.json()) as {
          templates?: Array<{
            id: string;
            name: string;
            is_default?: boolean;
          }>;
        };
        if (cancelled) return;
        const rows = (json.templates ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          is_default: Boolean(t.is_default),
        }));
        setTemplates(rows);
        const defaultId = rows.find((t) => t.is_default)?.id ?? "";
        setReportTemplateId((current) => current || defaultId);
      } catch {
        /* offline */
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runOcrForPhoto = useCallback(async (photoId: string, file: File) => {
    try {
      const { text, confidence } = await extractTextFromImage(file);
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, ocrText: text, ocrConfidence: confidence, ocrRunning: false }
            : p,
        ),
      );
    } catch {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, ocrRunning: false } : p)),
      );
    }
  }, []);

  const addPhotoFile = useCallback(
    (file: File, fromCamera: boolean) => {
      const id = crypto.randomUUID();
      const namedFile = fromCamera
        ? new File([file], cameraFilename(), {
            type: file.type || "image/jpeg",
            lastModified: Date.now(),
          })
        : file;

      const reader = new FileReader();
      reader.onload = () => {
        setPhotos((prev) => [
          ...prev,
          {
            id,
            file: namedFile,
            preview: reader.result as string,
            ocrText: "",
            ocrConfidence: null,
            ocrRunning: true,
          },
        ]);
        void runOcrForPhoto(id, namedFile);
      };
      reader.readAsDataURL(namedFile);
    },
    [runOcrForPhoto],
  );

  // Podržava izbor više fajlova odjednom iz "Dodaj fajl" dijaloga.
  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = "";
      if (files.length === 0) return;
      if (!clientId) {
        setMessage(ff.selectClientBeforePhoto);
        return;
      }
      setMessage(null);
      files.forEach((file) => addPhotoFile(file, false));
    },
    [addPhotoFile, clientId],
  );

  const onCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!clientId) {
        setMessage(ff.selectClientBeforeCamera);
        return;
      }
      setMessage(null);
      addPhotoFile(file, true);
    },
    [addPhotoFile, clientId],
  );

  const openCamera = useCallback(() => {
    if (!clientId) {
      setMessage(ff.selectClientBeforeCamera);
      return;
    }
    setMessage(null);
    cameraInputRef.current?.click();
  }, [clientId]);

  const openFilePicker = useCallback(() => {
    if (!clientId) {
      setMessage(ff.selectClientBeforePhoto);
      return;
    }
    setMessage(null);
    fileInputRef.current?.click();
  }, [clientId]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePhotoOcr = useCallback((id: string, text: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ocrText: text } : p)),
    );
  }, []);

  const removeRecordedAudio = useCallback(() => {
    if (audioPreviewUrlRef.current) {
      URL.revokeObjectURL(audioPreviewUrlRef.current);
      audioPreviewUrlRef.current = null;
    }
    setRecordedAudio(null);
    setRecordingSeconds(0);
    setRecordingError(null);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setRecordingError(null);
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setRecordingError(ff.recordingUnsupported);
      return;
    }

    removeRecordedAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);

        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - recordingStartedAtRef.current) / 1000),
        );
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        audioChunksRef.current = [];

        if (blob.size > 25 * 1024 * 1024) {
          setRecordingError(ff.audioTooLarge);
          setRecordingSeconds(0);
          return;
        }
        if (blob.size === 0) {
          setRecordingError(ff.recordingFailed);
          return;
        }

        const previewUrl = URL.createObjectURL(blob);
        audioPreviewUrlRef.current = previewUrl;
        setRecordedAudio({
          blob,
          previewUrl,
          filename: audioFilename(blob.type),
          durationSeconds,
        });
        setRecordingSeconds(durationSeconds);
      };

      recorder.start(1000);
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
        );
      }, 1000);
    } catch {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
      setRecordingError(ff.microphoneDenied);
    }
  }, [ff, removeRecordedAudio]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // Sinhrona provera — sprečava dupli submit i pre nego što se "saving" state ažurira.
      if (savingRef.current) return;
      setMessage(null);

      if (!clientId) {
        setMessage(ff.selectClientError);
        return;
      }

      const durationRaw = durationHours.trim()
        ? Number(durationHours.replace(",", "."))
        : null;
      // Max 24h — sprečava apsurdne vrednosti tipa "6526h" (npr. sekunde kao sati).
      const duration =
        durationRaw !== null &&
        Number.isFinite(durationRaw) &&
        durationRaw > 0 &&
        durationRaw <= 24
          ? durationRaw
          : null;

      if (durationHours.trim() && duration === null) {
        setMessage(ff.durationInvalid);
        return;
      }

      savingRef.current = true;
      setSaving(true);
      try {
        const isoDate = visitDate
          ? new Date(visitDate).toISOString()
          : new Date().toISOString();

        const combinedOcr = photos
          .map((p) => p.ocrText.trim())
          .filter(Boolean)
          .join("\n\n");

        const data: FieldVisitData = {
          client_company_id: clientId,
          scheduled_at: isoDate,
          status: "draft",
          sync_status: "pending",
          notes: notes.trim() ? notes.trim() : null,
          report_template_id: reportTemplateId || null,
          hitno_otklanjanje: hitnoOtklanjanje,
          parent_visit_id: selectedParent?.id ?? null,
          metadata: {
            ...(duration !== null ? { duration_hours: duration } : {}),
            risk_level: riskLevel,
            ...(combinedOcr ? { extracted_text: combinedOcr } : {}),
          },
        };

        const visit = await addToQueue("field_visits", "INSERT", data);

        for (const photo of photos) {
          await addFieldPhoto({
            fieldVisitLocalId: visit.id,
            file: photo.file,
            ocrText: photo.ocrText.trim() || null,
            ocrConfidence: photo.ocrConfidence,
          });
        }

        if (recordedAudio) {
          await addFieldAudio({
            fieldVisitLocalId: visit.id,
            blob: recordedAudio.blob,
            filename: recordedAudio.filename,
            durationSeconds: recordedAudio.durationSeconds,
            noiseMode,
          });
        }

        const photoCount = photos.length;
        await syncData();
        setMessage(
          isOnline
            ? photoCount > 0
              ? ff.savedOnlineWithPhotos.replace("{count}", String(photoCount))
              : ff.savedOnline
            : ff.savedOffline,
        );

        setNotes("");
        setDurationHours("");
        setRiskLevel("low");
        setHitnoOtklanjanje(false);
        setSelectedParent(null);
        setParentQuery("");
        setParentCandidates([]);
        setPredictedBroj(null);
        setPhotos([]);
        removeRecordedAudio();
        setNoiseMode("quiet");
        setReportTemplateId(
          templates.find((t) => t.is_default)?.id ?? reportTemplateId,
        );
        setVisitDate(nowLocalInput());
        await refreshSaved();

        // Odmah na listu „Moje posete“ (online ili offline lokalni zapis).
        router.push("/agencija/field-visits");
        router.refresh();
      } catch {
        setMessage(ff.saveError);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      clientId,
      visitDate,
      durationHours,
      notes,
      riskLevel,
      hitnoOtklanjanje,
      selectedParent,
      photos,
      recordedAudio,
      noiseMode,
      reportTemplateId,
      templates,
      isOnline,
      addToQueue,
      syncData,
      refreshSaved,
      removeRecordedAudio,
      router,
      ff,
    ],
  );

  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? id;

  // Samo poslednji unos — indikacija sync-a; puna lista je u Terenske posete.
  const latestSaved = [...saved].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  return (
    <div className="mt-8">
      <div className="mb-6 flex items-center justify-between rounded-md border border-ink/20 bg-surface px-4 py-3 text-sm">
        {!mounted ? (
          <span className="flex items-center gap-2 text-ink/60">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full bg-ink/20"
              aria-hidden
            />
            {ff.checkingStatus}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <span
                className={[
                  "inline-block h-2.5 w-2.5 rounded-full",
                  isOnline ? "bg-green-500" : "bg-red-500",
                  isSyncing ? "animate-pulse" : "",
                ].join(" ")}
              />
              <span className="font-medium text-ink">
                {isOnline ? ff.online : ff.offline}
              </span>
              {isSyncing ? (
                <span className="text-ink/60">· {ff.syncing}</span>
              ) : pending > 0 ? (
                <span className="text-ink/60">
                  · {pending} {ff.pendingSync}
                </span>
              ) : null}
            </span>
            {pending > 0 && isOnline ? (
              <button
                type="button"
                onClick={() => void syncData()}
                className="underline text-ink/70 hover:text-ink"
              >
                {ff.syncNow}
              </button>
            ) : null}
          </>
        )}
      </div>

      {mounted ? <SyncFailedNotice className="mb-6" /> : null}

      <div className="relative">
        {saving ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-md bg-surface/95 backdrop-blur-sm">
            <span
              className="h-10 w-10 animate-spin rounded-full border-4 border-ink/20 border-t-accent"
              aria-hidden
            />
            <p className="text-base font-medium text-ink">
              {photos.length > 0
                ? ff.saving + ` (${photos.length})`
                : ff.saving}
            </p>
          </div>
        ) : justSaved ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-md bg-surface/95 backdrop-blur-sm">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-600 text-2xl font-bold text-white"
              aria-hidden
            >
              ✓
            </span>
            <p className="text-base font-semibold text-green-800" role="status">
              {message ?? ff.savedOnline}
            </p>
          </div>
        ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="client"
            className="block text-sm font-medium text-ink"
          >
            {ff.client}
          </label>
          <select
            id="client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">{ff.selectClient}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clients.length === 0 ? (
            <p className="mt-1 text-xs text-ink/60">
              {ff.noClients}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="parent_visit"
            className="block text-sm font-medium text-ink"
          >
            {ff.controlVisitLabel}
          </label>
          <p className="mt-0.5 text-xs text-ink/60">{ff.controlVisitHint}</p>
          {selectedParent ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 border border-ink/30 bg-ink/[0.03] px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">
                {selectedParent.broj_naloga}
              </span>
              <span className="text-ink/70">
                {selectedParent.client_name ?? m.common.noData}
              </span>
              {selectedParent.is_delegated &&
              selectedParent.assigned_user_name ? (
                <span className="text-xs text-ink/60">
                  ({selectedParent.assigned_user_name})
                </span>
              ) : null}
              <button
                type="button"
                className="ml-auto text-xs underline"
                onClick={() => {
                  setSelectedParent(null);
                  setPredictedBroj(null);
                }}
              >
                {ff.controlVisitClear}
              </button>
            </div>
          ) : (
            <>
              <input
                id="parent_visit"
                type="search"
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value)}
                onFocus={() => {
                  if (parentCandidates.length === 0) {
                    void (async () => {
                      setParentSearchLoading(true);
                      try {
                        const res = await fetch(
                          `/api/field-visits/parent-candidates?q=`,
                        );
                        const json = (await res.json().catch(() => ({}))) as {
                          candidates?: ParentCandidate[];
                        };
                        setParentCandidates(json.candidates ?? []);
                      } catch {
                        setParentCandidates([]);
                      } finally {
                        setParentSearchLoading(false);
                      }
                    })();
                  }
                }}
                placeholder={ff.controlVisitSearchPlaceholder}
                className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent"
              />
              {parentSearchLoading ? (
                <p className="mt-1 text-xs text-ink/60">{m.common.loading}</p>
              ) : null}
              {parentCandidates.length > 0 ? (
                <ul className="mt-1 max-h-48 overflow-y-auto border border-ink/20 text-sm">
                  {parentCandidates
                    .filter((c) => {
                      if (!parentQuery.trim()) return true;
                      const q = parentQuery.trim().toLowerCase();
                      return (
                        c.broj_naloga.toLowerCase().includes(q) ||
                        (c.client_name?.toLowerCase().includes(q) ?? false) ||
                        (c.assigned_user_name?.toLowerCase().includes(q) ??
                          false)
                      );
                    })
                    .map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 border-b border-ink/10 px-3 py-2 text-left hover:bg-ink/[0.04]"
                          onClick={() => {
                            setSelectedParent(c);
                            setParentQuery("");
                            void (async () => {
                              try {
                                const res = await fetch(
                                  `/api/field-visits/parent-candidates?preview_parent_id=${encodeURIComponent(c.id)}`,
                                );
                                const json = (await res
                                  .json()
                                  .catch(() => ({}))) as {
                                  preview?: {
                                    predicted_broj_naloga: string;
                                  };
                                };
                                setPredictedBroj(
                                  json.preview?.predicted_broj_naloga ?? null,
                                );
                              } catch {
                                setPredictedBroj(null);
                              }
                            })();
                          }}
                        >
                          <span className="font-medium tabular-nums">
                            {c.broj_naloga}
                            {c.is_control ? ` · ${ff.controlVisitIsControl}` : ""}
                          </span>
                          <span className="text-xs text-ink/70">
                            {c.client_name ?? m.common.noData}
                            {c.scheduled_at
                              ? ` · ${formatVisitDate(c.scheduled_at, locale)}`
                              : ""}
                            {c.is_delegated && c.assigned_user_name
                              ? ` — ${c.assigned_user_name}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </>
          )}
          {selectedParent && predictedBroj ? (
            <p className="mt-2 text-sm text-ink/80" role="status">
              {ff.controlVisitPredicted.replace("{broj}", predictedBroj)}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="visit_date"
            className="block text-sm font-medium text-ink"
          >
            {ff.visitDate}
          </label>
          <input
            id="visit_date"
            type="datetime-local"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label
            htmlFor="duration"
            className="block text-sm font-medium text-ink"
          >
            {ff.durationHours}
          </label>
          <input
            id="duration"
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            placeholder={ff.durationPlaceholder}
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label htmlFor="risk" className="block text-sm font-medium text-ink">
            {ff.riskLevel}
          </label>
          <select
            id="risk"
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
            className="mt-1 w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="low">{fv.riskLow}</option>
            <option value="medium">{fv.riskMedium}</option>
            <option value="high">{fv.riskHigh}</option>
          </select>
        </div>

        <div className="flex items-start gap-2">
          <input
            id="hitno"
            type="checkbox"
            checked={hitnoOtklanjanje}
            onChange={(e) => setHitnoOtklanjanje(e.target.checked)}
            className="mt-1 border border-ink"
          />
          <label htmlFor="hitno" className="text-sm font-medium text-ink">
            {ff.hitnoOtklanjanje}
            <span className="mt-0.5 block text-xs font-normal text-ink/60">
              {ff.hitnoOtklanjanjeHint}
            </span>
          </label>
        </div>

        <p className="text-xs text-ink/60">{ff.brojNalogaHint}</p>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-ink">
            {ff.notes}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-border/40 px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label
            htmlFor="report_template"
            className="block text-sm font-medium text-ink"
          >
            {ff.reportTemplate}
          </label>
          <select
            id="report_template"
            value={reportTemplateId}
            onChange={(e) => setReportTemplateId(e.target.value)}
            disabled={templatesLoading}
            className="mt-1 w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          >
            <option value="">{ff.reportTemplateNone}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.is_default ? " ★" : ""}
              </option>
            ))}
          </select>
          {templatesLoading ? (
            <p className="mt-1 text-xs text-ink/60">
              {ff.reportTemplateLoading}
            </p>
          ) : null}
        </div>

        <fieldset className="border border-ink/20 p-4">
          <legend className="px-1 text-sm font-medium text-ink">
            {ff.audioTitle}
          </legend>
          <p className="text-xs text-ink/60">{ff.audioHint}</p>
          <div className="mt-3 flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="noise-mode"
                value="quiet"
                checked={noiseMode === "quiet"}
                onChange={() => setNoiseMode("quiet")}
                disabled={isRecording}
              />
              {ff.quietEnvironment}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="noise-mode"
                value="noisy"
                checked={noiseMode === "noisy"}
                onChange={() => setNoiseMode("noisy")}
                disabled={isRecording}
              />
              {ff.noisyEnvironment}
            </label>
          </div>

          {isRecording ? (
            <div className="mt-4 flex items-center gap-3" role="status">
              <span
                className="h-3 w-3 animate-pulse rounded-full bg-red-600"
                aria-hidden
              />
              <span className="font-mono text-sm font-semibold text-red-700">
                {ff.recording} {formatRecordingTime(recordingSeconds)}
              </span>
              <button
                type="button"
                onClick={stopRecording}
                className="border border-red-800 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-900"
              >
                {ff.stopRecording}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startRecording()}
                className="bzr-btn-primary"
              >
                {recordedAudio ? ff.recordAgain : ff.startRecording}
              </button>
              {recordedAudio ? (
                <button
                  type="button"
                  onClick={removeRecordedAudio}
                  className="border border-red-800 px-4 py-2 text-sm text-red-800"
                >
                  {ff.removeRecording}
                </button>
              ) : null}
            </div>
          )}

          {recordedAudio ? (
            <div className="mt-3">
              <audio controls src={recordedAudio.previewUrl} className="w-full" />
              <p className="mt-1 text-xs text-ink/60">
                {ff.recordingReady.replace(
                  "{duration}",
                  formatRecordingTime(recordedAudio.durationSeconds),
                )}
              </p>
            </div>
          ) : null}
          {recordingError ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {recordingError}
            </p>
          ) : null}
        </fieldset>

        <div>
          <p className="block text-sm font-medium text-ink">
            {ff.photosTitle}
          </p>
          <p className="mt-1 text-xs text-ink/60">{ff.photosHint}</p>

          {/* Skriveni inputi — fajl (multi-select) vs. kamera (jedan snimak) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFileSelected}
            className="hidden"
            aria-hidden
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onCameraCapture}
            className="hidden"
            aria-hidden
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-lg border border-border/40 bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5"
            >
              {ff.addFile}
            </button>
            <button
              type="button"
              onClick={openCamera}
              className="bzr-btn-primary"
            >
              {ff.takePhoto}
            </button>
          </div>

          {ocrRunning ? (
            <p className="mt-2 text-sm text-ink/70">{ff.ocrRunning}</p>
          ) : null}

          {photos.length > 0 ? (
            <ul className="mt-4 space-y-4">
              {photos.map((photo) => (
                <li
                  key={photo.id}
                  className="rounded border border-ink/20 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt={ff.photoAlt}
                      className="max-h-40 rounded border border-ink/20"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="shrink-0 text-xs text-red-700 underline"
                    >
                      {ff.removePhoto}
                    </button>
                  </div>
                  {photo.ocrRunning ? (
                    <p className="mt-2 text-xs text-ink/60">{ff.ocrShort}</p>
                  ) : photo.ocrText ? (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-ink">
                        {ff.recognizedText}
                      </p>
                      <textarea
                        value={photo.ocrText}
                        onChange={(e) =>
                          updatePhotoOcr(photo.id, e.target.value)
                        }
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-border/40 px-2 py-1 text-xs text-ink/90 outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={saving || ocrRunning || isRecording}
          aria-busy={saving}
          className="bzr-btn-primary w-full"
        >
          {saving ? ff.saving : ff.save}
        </button>

        {message && !justSaved ? (
          <p className="text-sm text-ink/80" role="status">
            {message}
          </p>
        ) : null}
      </form>
      </div>

      {latestSaved ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-ink">
            {ff.localSavedTitle}
          </h2>
          <div className="mt-3 flex items-center justify-between border border-ink/20 px-3 py-2 text-sm">
            <span className="text-ink/90">
              {clientName(latestSaved.data.client_company_id)} ·{" "}
              {new Date(
                latestSaved.data.scheduled_at ?? latestSaved.createdAt,
              ).toLocaleString(locale === "en" ? "en-GB" : "sr-Latn-RS")}
            </span>
            <span
              className={[
                latestSaved.synced
                  ? "bzr-badge-success"
                  : "bzr-badge-warning",
              ].join(" ")}
            >
              {latestSaved.synced ? ff.localSynced : ff.localPending}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}