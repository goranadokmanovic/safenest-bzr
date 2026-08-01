"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TooltipProps = {
  content: string;
  children: ReactNode;
  /** Kad je true, tooltip se ne prikazuje (npr. dok je panel otvoren). */
  disabled?: boolean;
  delayMs?: number;
  className?: string;
};

/**
 * Lagani hover/focus tooltip. Nema portala — pozicionira se relative na
 * wrapper. Za FAB u donjem desnom uglu podrazumevano iznad, poravnato desno.
 */
export function Tooltip({
  content,
  children,
  disabled = false,
  delayMs = 300,
  className = "",
}: TooltipProps) {
  const tipId = useId();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function show() {
    if (disabled) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setVisible(true), delayMs);
  }

  function hide() {
    clearTimer();
    setVisible(false);
  }

  useEffect(() => {
    if (disabled) hide();
    return clearTimer;
    // hide/clearTimer su stabilne u praksi; namerno samo disabled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const showTip = visible && !disabled && content.trim().length > 0;

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {/* aria-describedby samo kad je tip vidljiv — inače screen reader ne čita stale tip */}
      <div aria-describedby={showTip ? tipId : undefined}>{children}</div>
      {showTip ? (
        <div
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+0.55rem)] right-0 z-[70] w-[min(18.5rem,calc(100vw-2rem))] rounded-xl border border-border/45 bg-surface px-3 py-2.5 text-left text-xs leading-relaxed text-ink shadow-[0_10px_28px_rgb(0_0_0/0.22)]"
        >
          {content}
          <span
            aria-hidden
            className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 border-b border-r border-border/45 bg-surface"
          />
        </div>
      ) : null}
    </div>
  );
}
