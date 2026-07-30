"use client";

import { useEffect } from "react";
import { initSyncManager, syncNow } from "@/lib/offline/syncManager";
import { isOfflineEnabled } from "@/lib/offline/config";
import { precacheOfflineChunks } from "@/lib/offline/precache";
import { OfflineIndicator } from "@/components/offline/OfflineIndicator";
import { SyncProgress } from "@/components/offline/SyncProgress";

const SYNC_TAG = "safenest-sync";

export function OfflineProvider() {
  useEffect(() => {
    if (!isOfflineEnabled()) return;

    void initSyncManager();

    // Registracija Service Worker-a.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (registration) => {
          // Background Sync (ako je podržan).
          try {
            const swReg = registration as ServiceWorkerRegistration & {
              sync?: { register: (tag: string) => Promise<void> };
            };
            if (swReg.sync) {
              await swReg.sync.register(SYNC_TAG);
            }
          } catch {
            /* Background Sync nije podržan — fallback na interval/online event. */
          }
        })
        .then(() => {
          /* Kada je SW aktivan, dovuci chunk-ove za offline upotrebu. */
          precacheOfflineChunks();
        })
        .catch(() => {
          /* SW registracija nije uspela — app i dalje radi (interval sync). */
        });

      // SW poruke (npr. okidanje sync-a iz background sync eventa).
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === "SYNC_TRIGGER") {
          void syncNow();
        }
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      return () => {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      };
    }
  }, []);

  if (!isOfflineEnabled()) return null;

  return (
    <>
      <OfflineIndicator />
      <SyncProgress />
    </>
  );
}
