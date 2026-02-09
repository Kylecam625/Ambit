"use client";

import { useCallback, useMemo, useState } from "react";
import type { identity_journal_entry_summary } from "@/lib/identity/identity_types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MOOD_COLORS: Record<string, string> = {
  excited: "bg-amber-400",
  calm: "bg-emerald-400",
  intense: "bg-red-400",
  playful: "bg-pink-400",
  warm: "bg-orange-400",
  mysterious: "bg-purple-400",
  sad: "bg-blue-400",
  neutral: "bg-zinc-400",
};

type JournalCalendarProps = {
  entries: identity_journal_entry_summary[];
  selected_date: string | null;
  on_select_date: (date: string) => void;
  year: number;
  month: number;
  on_change_month: (year: number, month: number) => void;
  movie_dates?: Set<string>;
};

const format_date = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const get_today_str = (): string => {
  const now = new Date();
  return format_date(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const JournalCalendar = ({
  entries,
  selected_date,
  on_select_date,
  year,
  month,
  on_change_month,
  movie_dates,
}: JournalCalendarProps) => {
  const today_str = useMemo(() => get_today_str(), []);

  const entry_map = useMemo(() => {
    const map = new Map<string, identity_journal_entry_summary>();
    for (const e of entries) map.set(e.entry_date, e);
    return map;
  }, [entries]);

  // Build calendar grid
  const calendar_days = useMemo(() => {
    const first_day_of_month = new Date(year, month - 1, 1);
    const start_weekday = first_day_of_month.getDay();
    const days_in_month = new Date(year, month, 0).getDate();

    const cells: Array<{ day: number; date_str: string } | null> = [];

    // Leading blanks
    for (let i = 0; i < start_weekday; i++) cells.push(null);

    // Day cells
    for (let d = 1; d <= days_in_month; d++) {
      cells.push({ day: d, date_str: format_date(year, month, d) });
    }

    return cells;
  }, [year, month]);

  const go_prev = useCallback(() => {
    if (month === 1) on_change_month(year - 1, 12);
    else on_change_month(year, month - 1);
  }, [year, month, on_change_month]);

  const go_next = useCallback(() => {
    if (month === 12) on_change_month(year + 1, 1);
    else on_change_month(year, month + 1);
  }, [year, month, on_change_month]);

  const go_today = useCallback(() => {
    const now = new Date();
    on_change_month(now.getFullYear(), now.getMonth() + 1);
    on_select_date(today_str);
  }, [on_change_month, on_select_date, today_str]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
      {/* Header: month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={go_prev}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Previous month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3l-5 5 5 5" /></svg>
        </button>
        <button
          type="button"
          onClick={go_today}
          className="text-sm font-semibold text-zinc-200 hover:text-amber-200 transition-colors cursor-pointer"
          title="Go to today"
        >
          {MONTH_NAMES[month - 1]} {year}
        </button>
        <button
          type="button"
          onClick={go_next}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Next month"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] font-medium text-zinc-500 uppercase tracking-wider py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {calendar_days.map((cell, i) => {
          if (!cell) {
            return <div key={`blank-${i}`} className="h-9" />;
          }

          const is_today = cell.date_str === today_str;
          const is_selected = cell.date_str === selected_date;
          const entry = entry_map.get(cell.date_str);
          const has_entry = Boolean(entry);
          const has_movie = movie_dates?.has(cell.date_str) ?? false;
          const mood_color = entry?.mood ? MOOD_COLORS[entry.mood] || MOOD_COLORS.neutral : MOOD_COLORS.neutral;
          const is_future = cell.date_str > today_str;

          return (
            <button
              key={cell.date_str}
              type="button"
              onClick={() => !is_future && on_select_date(cell.date_str)}
              disabled={is_future}
              className={`
                relative flex h-9 flex-col items-center justify-center rounded-lg text-sm transition-all cursor-pointer
                ${is_selected
                  ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/50"
                  : is_today
                    ? "bg-white/10 text-white font-semibold"
                    : is_future
                      ? "text-zinc-600 cursor-not-allowed"
                      : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                }
              `}
            >
              {cell.day}
              <div className="absolute bottom-0.5 flex items-center gap-0.5">
                {has_entry && (
                  <span className={`h-1.5 w-1.5 rounded-full ${mood_color}`} />
                )}
                {has_movie && (
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-400">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
          Entry
        </span>
        <span className="flex items-center gap-1">
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-400">
            <path d="M8 5v14l11-7z" />
          </svg>
          Movie
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/25 ring-1 ring-amber-500/50" />
          Selected
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-white/10" />
          Today
        </span>
      </div>
    </div>
  );
};
