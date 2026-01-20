"use client";

import { useEffect, useRef, useState } from "react";

type ui_event = {
  type: string;
  [key: string]: unknown;
};

const FADE_OUT_MS = 500;

const to_int = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const find_latest_display_image_event = (ui_events: ui_event[]): ui_event | null => {
  for (let i = ui_events.length - 1; i >= 0; i -= 1) {
    const e = ui_events[i];
    if (e && typeof e === "object" && e.type === "display_image") return e;
  }
  return null;
};

export const GeneratedImageOverlay = ({
  ui_events,
}: {
  ui_events: ui_event[];
}) => {
  const last_handled_key_ref = useRef<string | null>(null);
  const display_timer_ref = useRef<number | null>(null);
  const fade_timer_ref = useRef<number | null>(null);

  const [image_data_url, set_image_data_url] = useState<string | null>(null);
  const [is_fading_out, set_is_fading_out] = useState(false);

  const clear_timers = () => {
    if (display_timer_ref.current !== null) {
      window.clearTimeout(display_timer_ref.current);
      display_timer_ref.current = null;
    }
    if (fade_timer_ref.current !== null) {
      window.clearTimeout(fade_timer_ref.current);
      fade_timer_ref.current = null;
    }
  };

  const dismiss = () => {
    if (!image_data_url) return;
    clear_timers();
    set_is_fading_out(true);
    fade_timer_ref.current = window.setTimeout(() => {
      set_image_data_url(null);
      set_is_fading_out(false);
      fade_timer_ref.current = null;
    }, FADE_OUT_MS);
  };

  useEffect(() => {
    const event = find_latest_display_image_event(ui_events);
    if (!event) return;

    const next_image_data_url =
      typeof event["image_data_url"] === "string" ? String(event["image_data_url"]) : "";
    if (!next_image_data_url) return;

    const task_id = typeof event["task_id"] === "string" ? event["task_id"].trim() : "";
    const key = task_id || next_image_data_url;
    if (last_handled_key_ref.current === key) return;
    last_handled_key_ref.current = key;

    const display_ms = (() => {
      const ms = to_int(event["display_ms"]);
      return ms > 0 ? ms : 5000;
    })();

    clear_timers();
    const raf_id = window.requestAnimationFrame(() => {
      set_is_fading_out(false);
      set_image_data_url(next_image_data_url);
    });

    display_timer_ref.current = window.setTimeout(() => {
      set_is_fading_out(true);
      fade_timer_ref.current = window.setTimeout(() => {
        set_image_data_url(null);
        set_is_fading_out(false);
        fade_timer_ref.current = null;
      }, FADE_OUT_MS);
      display_timer_ref.current = null;
    }, display_ms);

    return () => {
      window.cancelAnimationFrame(raf_id);
      clear_timers();
    };
  }, [ui_events]);

  useEffect(() => {
    return () => clear_timers();
  }, []);

  if (!image_data_url) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 transition-opacity duration-500 ease-out ${
        is_fading_out ? "opacity-0" : "opacity-100"
      }`}
    >
      <button
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-md backdrop-saturate-150"
        type="button"
        aria-label="Close image"
        onClick={dismiss}
      />

      <div className="relative w-full max-w-2xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-3 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image_data_url}
            alt="Generated"
            className="h-auto w-full rounded-xl object-contain"
          />
        </div>
      </div>
    </div>
  );
};

