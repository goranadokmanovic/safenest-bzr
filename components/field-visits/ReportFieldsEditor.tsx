"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  isReportFieldEmpty,
  parseReportTextToFields,
  sortReportFieldEntries,
  type ReportFields,
} from "@/lib/api/report-fields";

type NoiseMode = "quiet" | "noisy";

type Props = {
  visitId: string;
  initialFields: ReportFields | null;
  legacyReportText: string;
  disabled: boolean;
  /** Zaključan zapisnik — sakrij Sačuvaj / glasovni unos. */
  locked?: boolean;
  onSaved?: (fields: ReportFields) => void;
  onFieldsChange?: (fields: ReportFields) => void;
};

type RecordedAudio = {
  blob: Blob;
  filename: string;
  previewUrl: string;
  durationSeconds: number;
};

function supportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
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
  return `fill-fields-${ts}.${extension}`;
}

function formatRecordingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolveInitialFields(
  initialFields: ReportFields | null,
  legacyReportText: string,
): ReportFields {
  if (initialFields && Object.keys(initialFields).length > 0) {
    return { ...initialFields };
  }
  if (legacyReportText.trim()) {
    return parseReportTextToFields(legacyReportText);
  }
  return {};
}

export function ReportFieldsEditor({
  visitId,
  initialFields,
  legacyReportText,
  disabled,
  locked = false,
  onSaved,
  onFieldsChange,
}: Props) {
  const { m } = useTranslations();
  const fv = m.dashboard.fieldVisits;
  const ff = fv.form;

  const [fields, setFields] = useState<ReportFields>(() =>
    resolveInitialFields(initialFields, legacyReportText),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [noiseMode, setNoiseMode] = useState<NoiseMode>("quiet");
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setFields(resolveInitialFields(initialFields, legacyReportText));
  }, [initialFields, legacyReportText]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioPreviewUrlRef.current) {
        URL.revokeObjectURL(audioPreviewUrlRef.current);
      }
    };
  }, []);

  const updateField = useCallback(
    (name: string, value: string) => {
      setFields((prev) => {
        const next = { ...prev, [name]: value };
        onFieldsChange?.(next);
        return next;
      });
    },
    [onFieldsChange],
  );

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
          return;
        }

        const previewUrl = URL.createObjectURL(blob);
        audioPreviewUrlRef.current = previewUrl;
        setRecordedAudio({
          blob,
          filename: audioFilename(blob.type || mimeType),
          previewUrl,
          durationSeconds,
        });
      };

      recorder.start();
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(
          Math.max(
            0,
            Math.round((Date.now() - recordingStartedAtRef.current) / 1000),
          ),
        );
      }, 250);
    } catch {
      setRecordingError(ff.microphoneDenied);
    }
  }, [ff, removeRecordedAudio]);

  async function saveFields() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/field-visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_fields: fields }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        report_fields?: ReportFields;
      };
      if (!response.ok) {
        setMessage(body.error ?? m.common.error);
        return;
      }
      const saved = body.report_fields ?? fields;
      setFields(saved);
      onSaved?.(saved);
      setMessage(fv.reportSaved);
    } catch {
      setMessage(m.common.networkError);
    } finally {
      setSaving(false);
    }
  }

  async function submitVoiceFill() {
    if (!recordedAudio || filling) return;
    setFilling(true);
    setMessage(null);
    setRecordingError(null);
    try {
      const form = new FormData();
      form.append("audio", recordedAudio.blob, recordedAudio.filename);
      form.append("noise_mode", noiseMode);

      const response = await fetch(
        `/api/field-visits/${visitId}/fill-report-fields`,
        { method: "POST", body: form },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        report_fields?: ReportFields;
      };
      if (!response.ok) {
        setMessage(body.error ?? m.common.error);
        return;
      }
      const next = body.report_fields ?? fields;
      setFields(next);
      onSaved?.(next);
      onFieldsChange?.(next);
      removeRecordedAudio();
      setVoiceOpen(false);
      setMessage(fv.reportVoiceFilled);
    } catch {
      setMessage(m.common.networkError);
    } finally {
      setFilling(false);
    }
  }

  const entries = sortReportFieldEntries(Object.entries(fields));
  const busy = disabled || locked || saving || filling || isRecording;

  if (entries.length === 0) {
    return (
      <p className="text-xs text-ink/60">{fv.reportFieldsEmpty}</p>
    );
  }

  return (
    <div className="space-y-3">
      {locked ? (
        <p className="text-xs text-ink/70">{fv.reportLockedHint}</p>
      ) : null}
      <div className="space-y-3">
        {entries.map(([name, value]) => {
          const empty = isReportFieldEmpty(value);
          return (
            <div key={name}>
              <label
                htmlFor={`report-field-${name}`}
                className="block text-xs font-medium text-ink/80"
              >
                {name}
              </label>
              <textarea
                id={`report-field-${name}`}
                value={empty ? "" : value}
                onChange={(e) => updateField(name, e.target.value)}
                rows={2}
                disabled={busy}
                readOnly={locked}
                placeholder={fv.reportFieldEmptyPlaceholder}
                className={`mt-1 w-full border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent disabled:bg-ink/[0.03] ${
                  empty
                    ? "border-ink/25 text-ink/50 placeholder:text-ink/40"
                    : "border-ink/40 text-ink"
                }`}
              />
            </div>
          );
        })}
      </div>

      {!locked ? (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void saveFields()}
          disabled={busy}
          className="bzr-btn-primary bzr-btn-sm"
        >
          {saving ? fv.reportSaving : fv.reportSave}
        </button>
        <button
          type="button"
          onClick={() => {
            setVoiceOpen((v) => !v);
            setRecordingError(null);
            setMessage(null);
          }}
          disabled={disabled || filling}
          className="rounded-lg border border-border/40 px-3 py-1.5 text-xs"
        >
          {voiceOpen ? fv.reportVoiceCancel : fv.reportVoiceAdd}
        </button>
        {message ? (
          <span className="text-xs text-ink/70" role="status">
            {message}
          </span>
        ) : null}
      </div>
      ) : null}

      {!locked && voiceOpen ? (
        <div className="space-y-3 border border-ink/20 bg-ink/[0.02] p-3">
          <p className="text-xs text-ink/70">{fv.reportVoiceHint}</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="fill-noise-mode"
                value="quiet"
                checked={noiseMode === "quiet"}
                onChange={() => setNoiseMode("quiet")}
                disabled={isRecording || filling}
              />
              {ff.quietEnvironment}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="fill-noise-mode"
                value="noisy"
                checked={noiseMode === "noisy"}
                onChange={() => setNoiseMode("noisy")}
                disabled={isRecording || filling}
              />
              {ff.noisyEnvironment}
            </label>
          </div>

          {isRecording ? (
            <div className="flex items-center gap-3" role="status">
              <span
                className="h-3 w-3 animate-pulse rounded-full bg-red-600"
                aria-hidden
              />
              <span className="font-mono text-xs font-semibold text-red-700">
                {ff.recording} {formatRecordingTime(recordingSeconds)}
              </span>
              <button
                type="button"
                onClick={stopRecording}
                className="border border-red-800 bg-red-50 px-2 py-1 text-xs font-semibold text-red-900"
              >
                {ff.stopRecording}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={filling}
                className="bzr-btn-primary bzr-btn-sm"
              >
                {recordedAudio ? ff.recordAgain : ff.startRecording}
              </button>
              {recordedAudio ? (
                <button
                  type="button"
                  onClick={removeRecordedAudio}
                  disabled={filling}
                  className="border border-red-800 px-3 py-1.5 text-xs text-red-800 disabled:opacity-50"
                >
                  {ff.removeRecording}
                </button>
              ) : null}
            </div>
          )}

          {recordedAudio ? (
            <div>
              <audio
                controls
                src={recordedAudio.previewUrl}
                className="w-full"
              />
              <button
                type="button"
                onClick={() => void submitVoiceFill()}
                disabled={filling || isRecording}
                className="mt-2 bzr-btn-primary bzr-btn-sm"
              >
                {filling ? fv.reportVoiceFilling : fv.reportVoiceSubmit}
              </button>
            </div>
          ) : null}

          {recordingError ? (
            <p className="text-xs text-red-700" role="alert">
              {recordingError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
