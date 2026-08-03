"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/i18n/locale-provider";
import {
  addDaysIso,
  addMonthsIso,
  startOfMonth,
  startOfWeekMonday,
  todayBelgradeDay,
  type CalendarVisit,
  type CalendarViewMode,
} from "@/lib/field-visits/scheduling-calendar";
import { fieldVisitsListHref } from "@/lib/field-visits/list";

const MONTH_VISIBLE_CHIPS = 2;

function formatDayHeading(dayIso: string, locale: string): string {
  try {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString(
      locale === "en" ? "en-GB" : "sr-Latn-RS",
      { weekday: "short", day: "numeric", month: "short" },
    );
  } catch {
    return dayIso;
  }
}

function formatWeekdayShort(dayIso: string, locale: string): string {
  try {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString(
      locale === "en" ? "en-GB" : "sr-Latn-RS",
      { weekday: "short" },
    );
  } catch {
    return dayIso;
  }
}

function formatTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(
      locale === "en" ? "en-GB" : "sr-Latn-RS",
      { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Belgrade" },
    );
  } catch {
    return "—";
  }
}

function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayNumber(dayIso: string): string {
  return String(Number(dayIso.slice(8, 10)));
}

function VisitHoverTip({
  anchor,
  clientName,
  workerName,
  clientLabel,
  workerLabel,
}: {
  anchor: DOMRect | null;
  clientName: string;
  workerName: string;
  clientLabel: string;
  workerLabel: string;
}) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) {
      setPos(null);
      return;
    }
    const tip = tipRef.current.getBoundingClientRect();
    const gap = 10;
    const pad = 12;
    let left = anchor.left + anchor.width / 2 - tip.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tip.width - pad));
    let top = anchor.top - tip.height - gap;
    if (top < pad) {
      top = anchor.bottom + gap;
    }
    setPos({ top, left });
  }, [anchor, clientName, workerName]);

  if (!anchor || typeof document === "undefined") return null;

  return createPortal(
    <span
      ref={tipRef}
      className="bzr-cal-tip"
      role="tooltip"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: -9999, left: -9999, visibility: "hidden" }
      }
    >
      <span className="bzr-cal-tip__row">
        <span className="bzr-cal-tip__label">{clientLabel}</span>
        <span className="bzr-cal-tip__value">{clientName}</span>
      </span>
      <span className="bzr-cal-tip__row">
        <span className="bzr-cal-tip__label">{workerLabel}</span>
        <span className="bzr-cal-tip__value">{workerName}</span>
      </span>
    </span>,
    document.body,
  );
}

function useChipTip() {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  function show() {
    const el = wrapRef.current;
    if (!el) return;
    setAnchor(el.getBoundingClientRect());
  }

  function hide() {
    setAnchor(null);
  }

  return { wrapRef, anchor, show, hide };
}

function VisitChipCompact({
  visit,
  unassigned,
  clientLabel,
  workerLabel,
  locale,
}: {
  visit: CalendarVisit;
  unassigned: string;
  clientLabel: string;
  workerLabel: string;
  locale: string;
}) {
  const clientName = visit.client_name?.trim() || "—";
  const workerName = visit.assigned_user_name?.trim() || unassigned;
  const tip = useChipTip();

  return (
    <span
      ref={tip.wrapRef}
      className="bzr-cal-chip-wrap"
      onMouseEnter={tip.show}
      onMouseLeave={tip.hide}
      onFocus={tip.show}
      onBlur={tip.hide}
    >
      <Link
        href={fieldVisitsListHref({
          visitId: visit.id,
          scheduledAt: visit.scheduled_at,
          status: visit.status,
          from: "zakazivanje",
        })}
        className="bzr-cal-chip"
      >
        <span className="font-semibold">
          {formatTime(visit.scheduled_at, locale)}
        </span>
        <span className="text-ink/50"> · </span>
        <span>{clientName}</span>
      </Link>
      {tip.anchor ? (
        <VisitHoverTip
          anchor={tip.anchor}
          clientName={clientName}
          workerName={workerName}
          clientLabel={clientLabel}
          workerLabel={workerLabel}
        />
      ) : null}
    </span>
  );
}

function MonthGrid({
  days,
  byDay,
  monthPrefix,
  today,
  locale,
  moreVisitsLabel,
  unassigned,
  clientLabel,
  workerLabel,
  onOpenDay,
}: {
  days: string[];
  byDay: Map<string, CalendarVisit[]>;
  monthPrefix: string;
  today: string;
  locale: string;
  moreVisitsLabel: string;
  unassigned: string;
  clientLabel: string;
  workerLabel: string;
  onOpenDay: (dayIso: string) => void;
}) {
  const weekdays = useMemo(() => {
    return days.slice(0, 7).map((d) => formatWeekdayShort(d, locale));
  }, [days, locale]);

  return (
    <div className="overflow-x-auto pb-2 pt-1">
      <div className="bzr-cal min-w-[36rem]">
      <div className="bzr-cal-weekdays">
        {weekdays.map((label) => (
          <div key={label} className="bzr-cal-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="bzr-cal-month-grid">
        {days.map((day) => {
          const inMonth = day.startsWith(monthPrefix);
          const items = byDay.get(day) ?? [];
          const booked = items.length > 0;
          const visible = items.slice(0, MONTH_VISIBLE_CHIPS);
          const overflow = items.length - visible.length;
          const isToday = day === today;

          return (
            <section
              key={day}
              className={[
                "bzr-cal-cell",
                booked ? "bzr-cal-cell--booked" : "",
                !inMonth ? "bzr-cal-cell--muted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <span
                  className={[
                    "bzr-cal-daynum",
                    isToday ? "bzr-cal-daynum--today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {dayNumber(day)}
                </span>
                {booked ? (
                  <span className="bzr-cal-count">
                    <span className="bzr-cal-count-dot" aria-hidden />
                    {items.length}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-0.5">
                {visible.map((v) => (
                  <li key={v.id}>
                    <VisitChipCompact
                      visit={v}
                      locale={locale}
                      unassigned={unassigned}
                      clientLabel={clientLabel}
                      workerLabel={workerLabel}
                    />
                  </li>
                ))}
              </ul>
              {overflow > 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className="mt-0.5 w-full truncate px-1 text-left text-[0.84rem] font-semibold text-accent hover:underline"
                >
                  {moreVisitsLabel.replace("{count}", String(overflow))}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function DayWeekGrid({
  view,
  days,
  byDay,
  today,
  locale,
  unassigned,
  clientLabel,
  workerLabel,
}: {
  view: "day" | "week";
  days: string[];
  byDay: Map<string, CalendarVisit[]>;
  today: string;
  locale: string;
  unassigned: string;
  clientLabel: string;
  workerLabel: string;
}) {
  const weekdays = useMemo(
    () => days.map((d) => formatWeekdayShort(d, locale)),
    [days, locale],
  );

  return (
    <div className="overflow-x-auto pb-2 pt-1">
      <div className={`bzr-cal ${view === "week" ? "min-w-[36rem]" : ""}`}>
        {view === "week" ? (
          <div className="bzr-cal-weekdays">
            {weekdays.map((label, i) => (
              <div key={`${label}-${days[i]}`} className="bzr-cal-weekday">
                {label}
              </div>
            ))}
          </div>
        ) : (
          <div className="bzr-cal-weekdays bzr-cal-weekdays--day">
            <div className="bzr-cal-weekday">
              {days[0] ? formatDayHeading(days[0], locale) : "—"}
            </div>
          </div>
        )}
        <div
          className={view === "week" ? "bzr-cal-month-grid" : "bzr-cal-day-grid"}
        >
          {days.map((day) => {
            const items = byDay.get(day) ?? [];
            const booked = items.length > 0;
            const isToday = day === today;

            return (
              <section
                key={day}
                className={[
                  "bzr-cal-cell",
                  view === "day" ? "bzr-cal-cell--day" : "",
                  booked ? "bzr-cal-cell--booked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={[
                      "bzr-cal-daynum",
                      isToday ? "bzr-cal-daynum--today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {dayNumber(day)}
                  </span>
                  {booked ? (
                    <span className="bzr-cal-count">
                      <span className="bzr-cal-count-dot" aria-hidden />
                      {items.length}
                    </span>
                  ) : null}
                </div>
                {items.length === 0 ? (
                  <p className="mt-1 text-[0.84rem] text-ink/35">—</p>
                ) : (
                  <ul className="space-y-0.5">
                    {items.map((v) => (
                      <li key={v.id}>
                        <VisitChipCompact
                          visit={v}
                          locale={locale}
                          unassigned={unassigned}
                          clientLabel={clientLabel}
                          workerLabel={workerLabel}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SchedulingCalendar() {
  const { m, locale } = useTranslations();
  const s = m.agencija.scheduling;

  const [view, setView] = useState<CalendarViewMode>("week");
  const [anchor, setAnchor] = useState(todayBelgradeDay);
  const [visits, setVisits] = useState<CalendarVisit[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/field-visits/calendar?view=${view}&date=${encodeURIComponent(anchor)}`,
      );
      const json = (await res.json().catch(() => ({}))) as {
        visits?: CalendarVisit[];
        from?: string;
        to?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? s.loadError);
        setVisits([]);
        return;
      }
      setVisits(json.visits ?? []);
      setRange(
        json.from && json.to ? { from: json.from, to: json.to } : null,
      );
    } catch {
      setError(s.loadError);
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [view, anchor, s.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => {
    if (!range) return [] as string[];
    const out: string[] = [];
    let d = range.from;
    while (d <= range.to) {
      out.push(d);
      d = addDaysIso(d, 1);
    }
    return out;
  }, [range]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarVisit[]>();
    for (const day of days) map.set(day, []);
    for (const v of visits) {
      const key = dayOf(v.scheduled_at);
      const list = map.get(key);
      if (list) list.push(v);
    }
    return map;
  }, [visits, days]);

  function shift(delta: number) {
    if (view === "day") {
      setAnchor((a) => addDaysIso(a, delta));
    } else if (view === "month") {
      setAnchor((a) => addMonthsIso(startOfMonth(a), delta));
    } else {
      setAnchor((a) => addDaysIso(startOfWeekMonday(a), delta * 7));
    }
  }

  function openDayView(dayIso: string) {
    setAnchor(dayIso);
    setView("day");
  }

  const today = todayBelgradeDay();
  const monthPrefix = startOfMonth(anchor).slice(0, 7);

  const viewButtons: Array<{ id: CalendarViewMode; label: string }> = [
    { id: "day", label: s.viewDay },
    { id: "week", label: s.viewWeek },
    { id: "month", label: s.viewMonth },
  ];

  return (
    <div className="space-y-5">
      <div className="bzr-cal-toolbar">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="bzr-cal-seg"
            role="group"
            aria-label={s.viewGroupLabel}
          >
            {viewButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setView(btn.id)}
                className={[
                  "bzr-cal-seg-btn",
                  view === btn.id ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <div className="bzr-cal-nav" role="group" aria-label={s.navGroupLabel}>
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={s.prev}
              title={s.prev}
              className="bzr-cal-nav-btn"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(todayBelgradeDay())}
              className="bzr-cal-nav-btn px-2.5"
            >
              {s.today}
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label={s.next}
              title={s.next}
              className="bzr-cal-nav-btn"
            >
              ›
            </button>
          </div>
        </div>
        <Link href="/agencija/field-visits/new" className="bzr-cal-cta">
          {s.newVisit}
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-ink/60">{s.loading}</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : view === "month" ? (
        <MonthGrid
          days={days}
          byDay={byDay}
          monthPrefix={monthPrefix}
          today={today}
          locale={locale}
          moreVisitsLabel={s.moreVisits}
          unassigned={s.unassigned}
          clientLabel={s.tipClient}
          workerLabel={s.tipWorker}
          onOpenDay={openDayView}
        />
      ) : (
        <DayWeekGrid
          view={view}
          days={days}
          byDay={byDay}
          today={today}
          locale={locale}
          unassigned={s.unassigned}
          clientLabel={s.tipClient}
          workerLabel={s.tipWorker}
        />
      )}

      {!loading && !error && visits.length === 0 ? (
        <p className="text-sm text-ink/55">{s.empty}</p>
      ) : null}
    </div>
  );
}
