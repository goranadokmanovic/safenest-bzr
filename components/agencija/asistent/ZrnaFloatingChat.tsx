"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/components/i18n/locale-provider";
import { AssistantChat } from "@/components/agencija/asistent/AssistantChat";
import { ZrnaRobot } from "@/components/brand/ZrnaRobot";
import { ZrnaShield } from "@/components/brand/ZrnaShield";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getZrnaPanelOpen,
  setZrnaPanelOpen,
  subscribeZrnaPanelOpen,
} from "@/lib/agent/zrna-panel-chat-store";

function isNavigationClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // Next <Link>, anchors, clickable rows (router.push), in-page tabs (router.replace).
  return !!target.closest('a[href], [role="link"], [role="tab"]');
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    // Collapse / minimize (arrows inward)
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="4 14 10 14 10 20" />
        <polyline points="20 10 14 10 14 4" />
        <line x1="14" y1="10" x2="21" y2="3" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    );
  }

  // Expand / maximize (arrows outward)
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/**
 * Plutajuće dugme + panel za Zrnu na svim /agencija (i dashboard) stranicama
 * preko AgencyShell. Bez full-page scrim-a — selekcija/copy sa stranice ispod
 * ostaje moguća. Na /agencija/asistent se ne prikazuje (izbegava dupli chat).
 *
 * `open` živi u module store-u — nezavisno od rute, preživljava remount.
 */
export function ZrnaFloatingChat() {
  const pathname = usePathname();
  const { m } = useTranslations();
  const a = m.dashboard.assistant;

  const hideFab =
    pathname === "/agencija/asistent" ||
    pathname.startsWith("/agencija/asistent/");

  const open = useSyncExternalStore(
    subscribeZrnaPanelOpen,
    getZrnaPanelOpen,
    getZrnaPanelOpen,
  );
  const setOpen = setZrnaPanelOpen;
  const [expanded, setExpanded] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);

  function closePanel() {
    setExpanded(false);
    setOpen(false);
    fabRef.current?.focus();
  }

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open || hideFab) return;

    function dismiss() {
      setExpanded(false);
      setOpen(false);
      fabRef.current?.focus();
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      dismiss();
    }

    function onPointerDown(ev: MouseEvent) {
      const target = ev.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (fabRef.current?.contains(target)) return;
      // Navigacija (sidebar, redovi-linke, tabovi) ne sme da zatvori panel.
      if (isNavigationClick(ev.target)) return;
      dismiss();
    }

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, hideFab, setOpen]);

  if (hideFab) return null;

  const panelShellClass = expanded
    ? "pointer-events-auto fixed inset-3 z-[60] flex flex-col overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-[0_16px_48px_rgb(0_0_0/0.35),0_0_0_1px_rgb(var(--color-accent)/0.08)] sm:inset-4"
    : "pointer-events-auto relative z-10 flex h-[min(85vh,48.75rem)] w-[min(100vw-1.5rem,26rem)] flex-col overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-[0_16px_48px_rgb(0_0_0/0.35),0_0_0_1px_rgb(var(--color-accent)/0.08)]";

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {/* Keep mounted when closed so in-flight requests + store-backed UI stay warm. */}
      <div
        className={
          open
            ? expanded
              ? "contents"
              : "relative"
            : "relative hidden"
        }
      >
        {/* Robot only in compact floating mode */}
        {!expanded ? (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 z-20 hidden -translate-x-[81%] rotate-[0.5deg] sm:block"
          >
            <ZrnaRobot
              size="md"
              className="drop-shadow-[-6px_8px_18px_rgb(0_0_0/0.28)]"
            />
          </div>
        ) : null}

        <div
          ref={panelRef}
          role="dialog"
          aria-modal={expanded}
          aria-hidden={!open}
          aria-label={a.title}
          className={panelShellClass}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/35 px-4 py-3">
            <div className="min-w-0">
              <p className="font-display text-[24px] font-bold tracking-tight text-ink">
                {a.title}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-ink/55">
                {a.intro}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="bzr-btn-ghost !px-2.5 !py-1.5 text-sm"
                aria-label={expanded ? a.collapseChat : a.expandChat}
                aria-pressed={expanded}
                title={expanded ? a.collapseChat : a.expandChat}
              >
                <ExpandIcon expanded={expanded} />
              </button>
              <button
                type="button"
                onClick={closePanel}
                className="bzr-btn-ghost !px-2.5 !py-1.5 text-sm"
                aria-label={a.closeChat}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
            <AssistantChat
              variant="panel"
              autoFocus={open}
              inputId="zrna-panel-input"
            />
          </div>
        </div>
      </div>

      <Tooltip
        content={a.fabTooltip}
        disabled={open}
        className="pointer-events-auto"
      >
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? a.closeChat : a.openChat}
          className="group relative border-0 bg-transparent p-0 transition duration-300 hover:scale-[1.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:scale-[0.98]"
        >
          <ZrnaShield
            size="fab"
            className="drop-shadow-[0_8px_22px_rgb(0_0_0/0.45),0_0_28px_rgb(var(--color-accent)/0.55)] transition duration-300 group-hover:drop-shadow-[0_10px_28px_rgb(0_0_0/0.5),0_0_40px_rgb(var(--color-accent)/0.72)]"
          />
          <span className="sr-only">{a.title}</span>
        </button>
      </Tooltip>
    </div>
  );
}
