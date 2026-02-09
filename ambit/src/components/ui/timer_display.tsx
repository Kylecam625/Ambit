"use client";

import type { timer } from "@/hooks/use_timers";

/** Format seconds into MM:SS or HH:MM:SS if >= 1 hour. */
const format_time = (seconds: number): { digits: string; separator: string }[] => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  if (h > 0) {
    const hh = String(h).padStart(2, "0");
    return [
      { digits: hh, separator: "" },
      { digits: mm, separator: ":" },
      { digits: ss, separator: ":" },
    ];
  }
  return [
    { digits: mm, separator: "" },
    { digits: ss, separator: ":" },
  ];
};

const RetroDigit = ({ char, is_done }: { char: string; is_done: boolean }) => (
  <span
    className={`inline-block ${is_done ? "retro-digit-done" : "retro-digit"}`}
    style={{ minWidth: char === ":" ? "0.3em" : "0.58em", textAlign: "center" }}
  >
    {char}
  </span>
);

/** Stop click events from bubbling up to the Orb's onClick. */
const stop_propagation = (e: React.MouseEvent) => e.stopPropagation();

export const TimerDisplay = ({
  timers,
  active_index,
  on_cycle,
  on_dismiss,
}: {
  timers: timer[];
  active_index: number;
  on_cycle: () => void;
  on_dismiss: (id: string) => void;
}) => {
  if (timers.length === 0) return null;

  const clamped_index = Math.min(active_index, timers.length - 1);
  const active = timers[clamped_index];
  if (!active) return null;

  const parts = active.is_done
    ? [{ digits: "00", separator: "" }, { digits: "00", separator: ":" }]
    : format_time(active.remaining_seconds);

  // Build individual characters for per-digit styling
  const chars: string[] = [];
  parts.forEach((part, i) => {
    if (i > 0) chars.push(part.separator);
    for (const ch of part.digits) chars.push(ch);
  });

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="flex flex-col items-center justify-center" onClick={stop_propagation}>
      {/* Multi-timer pill — only shows when 2+ timers */}
      {timers.length > 1 && (
        <button
          type="button"
          onClick={on_cycle}
          className="mb-1.5 retro-pill"
        >
          {clamped_index + 1} / {timers.length}
        </button>
      )}

      {/* Countdown digits — retro LED style, sized to fit inside the orb */}
      <div
        className={`retro-timer-digits ${active.is_done ? "retro-timer-done" : ""}`}
        style={{ fontSize: "clamp(1.8rem, 6vw, 2.8rem)" }}
      >
        {chars.map((ch, i) => (
          <RetroDigit key={i} char={ch} is_done={active.is_done} />
        ))}
      </div>

      {/* Label + dismiss */}
      <div className="mt-1 flex items-center gap-2">
        {active.label && (
          <span className="retro-timer-label">
            {active.label}
          </span>
        )}
        {active.is_done && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); on_dismiss(active.id); }}
            className="retro-dismiss-btn"
            aria-label="Dismiss timer"
          >
            DISMISS
          </button>
        )}
      </div>
    </div>
  );
};
