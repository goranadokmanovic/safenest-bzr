/**
 * Dovlačenje chunk-ova koji moraju biti u kešu pre nego što korisnik ode
 * offline. Radi zajedno sa `public/sw.js` (cache-first za `/_next/static/`):
 * ovde samo pokrenemo učitavanje, SW ga upiše u keš.
 */

import { warmSpreadsheetParser } from "@/lib/import/parse-sheet";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
};

export function precacheOfflineChunks(): void {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const run = () => {
    /* Parser za Excel/CSV uvoz — terenski radnici uvoze i bez konekcije. */
    warmSpreadsheetParser();
  };

  const idle = (window as IdleWindow).requestIdleCallback;
  if (idle) idle(run, { timeout: 8000 });
  else window.setTimeout(run, 4000);
}
