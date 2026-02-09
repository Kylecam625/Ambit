import { useCallback, useEffect, useRef, useState } from "react";

export type timer = {
  id: string;
  label: string;
  duration_seconds: number;
  started_at: number;
  remaining_seconds: number;
  is_done: boolean;
};

type ui_event = { type: string; [key: string]: unknown };

const CHIME_DURATION_MS = 20_000;
const CHIME_INTERVAL_MS = 1_600; // one arpeggio every ~1.6s

/** Play a single chime arpeggio into the given AudioContext. */
const play_single_chime = (ctx: AudioContext) => {
  const frequencies = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const note_duration = 0.2;

  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime + i * note_duration);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + (i + 1) * note_duration + 0.3
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + i * note_duration);
    osc.stop(ctx.currentTime + (i + 1) * note_duration + 0.3);
  });
};

// Module-level map: timer_id -> stop function for active chime loops.
// Lives outside React so adding/removing doesn't affect hook order.
const active_chime_stops: Record<string, () => void> = {};

/**
 * Play the chime on repeat for 20 seconds.
 * Stores the stop function in active_chime_stops keyed by timer_id.
 */
const start_chime_loop = (timer_id: string): void => {
  // Stop any existing chime for this timer first
  stop_chime_for_timer(timer_id);

  let stopped = false;
  let interval_id: ReturnType<typeof setInterval> | null = null;
  let ctx: AudioContext | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (interval_id !== null) clearInterval(interval_id);
    if (ctx) ctx.close().catch(() => {});
    delete active_chime_stops[timer_id];
  };

  try {
    ctx = new AudioContext();
    play_single_chime(ctx);

    interval_id = setInterval(() => {
      if (stopped || !ctx) return;
      play_single_chime(ctx);
    }, CHIME_INTERVAL_MS);

    // Auto-stop after 20 seconds
    setTimeout(stop, CHIME_DURATION_MS);
  } catch {
    // Web Audio API may not be available
    return;
  }

  active_chime_stops[timer_id] = stop;
};

/** Stop and clean up the chime loop for a specific timer. */
const stop_chime_for_timer = (timer_id: string): void => {
  const stop = active_chime_stops[timer_id];
  if (stop) stop();
};

/**
 * Manages countdown timers created via the set_timer tool.
 * Watches ui_events for "timer_started" events and ticks every second.
 */
export const use_timers = ({ ui_events }: { ui_events: ui_event[] }) => {
  const [timers, set_timers] = useState<timer[]>([]);
  const [active_timer_index, set_active_timer_index] = useState(0);
  const seen_timer_ids_ref = useRef<Set<string>>(new Set());

  // Watch for new timer_started events
  useEffect(() => {
    const new_timers: timer[] = [];
    for (const event of ui_events) {
      if (event.type !== "timer_started") continue;
      const timer_id = typeof event.timer_id === "string" ? event.timer_id : "";
      if (!timer_id || seen_timer_ids_ref.current.has(timer_id)) continue;

      const duration_seconds =
        typeof event.duration_seconds === "number" ? Math.max(1, Math.round(event.duration_seconds)) : 60;
      const label = typeof event.label === "string" ? event.label : "";

      seen_timer_ids_ref.current.add(timer_id);
      new_timers.push({
        id: timer_id,
        label,
        duration_seconds,
        started_at: Date.now(),
        remaining_seconds: duration_seconds,
        is_done: false,
      });
    }

    if (new_timers.length > 0) {
      set_timers((prev) => [...prev, ...new_timers]);
    }
  }, [ui_events]);

  // Tick every second
  useEffect(() => {
    if (timers.length === 0) return;
    // If all timers are done, no need to tick
    if (timers.every((t) => t.is_done)) return;

    const interval = setInterval(() => {
      set_timers((prev) =>
        prev.map((t) => {
          if (t.is_done) return t;
          const elapsed = Math.floor((Date.now() - t.started_at) / 1000);
          const remaining = Math.max(0, t.duration_seconds - elapsed);
          const is_done = remaining === 0;

          if (is_done && !t.is_done) {
            start_chime_loop(t.id);
          }

          return { ...t, remaining_seconds: remaining, is_done };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [timers]);

  // Dismiss a timer by id — also stops the chime
  const dismiss_timer = useCallback(
    (id: string) => {
      stop_chime_for_timer(id);

      set_timers((prev) => {
        const next = prev.filter((t) => t.id !== id);
        return next;
      });
      // Adjust active index if needed
      set_active_timer_index((prev_index) => {
        const remaining_count = timers.filter((t) => t.id !== id).length;
        if (remaining_count === 0) return 0;
        return Math.min(prev_index, remaining_count - 1);
      });
    },
    [timers]
  );

  // Cycle to next timer
  const cycle_active_timer = useCallback(() => {
    set_active_timer_index((prev) => {
      if (timers.length <= 1) return 0;
      return (prev + 1) % timers.length;
    });
  }, [timers.length]);

  // Clamp active index when timers change
  useEffect(() => {
    if (timers.length === 0) {
      set_active_timer_index(0);
      return;
    }
    set_active_timer_index((prev) => Math.min(prev, timers.length - 1));
  }, [timers.length]);

  return {
    timers,
    active_timer_index,
    set_active_timer_index,
    cycle_active_timer,
    dismiss_timer,
    has_timers: timers.length > 0,
  };
};
