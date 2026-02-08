import { useCallback, useEffect, useRef, useState } from "react";
import type { ui_event } from "./realtime_types";
import { is_record } from "./realtime_types";

type ActivePoller = {
  abort_controller: AbortController;
  timeout_id: number | null;
  started_at_ms: number;
  last_partial_image_index: number | null;
};

const IMAGE_TASK_TIMEOUT_MS = 1000 * 60 * 10; // 10 minutes
const POLL_INTERVAL_MS = 750;
const POLL_RETRY_DELAY_MS = 1000;

/**
 * Polls background image generation tasks and manages UI events
 * (display_image, image_task_partial, etc.).
 */
export const useImageTaskPolling = ({
  is_speaking_ref,
}: {
  is_speaking_ref: React.RefObject<boolean>;
}) => {
  const pollers_ref = useRef<Record<string, ActivePoller>>({});
  const latest_task_id_ref = useRef<string | null>(null);
  const pending_ui_events_ref = useRef<ui_event[]>([]);
  const [ui_events, set_ui_events] = useState<ui_event[]>([]);

  const stop_image_task_polling = useCallback((task_id: string) => {
    const trimmed = task_id.trim();
    if (!trimmed) return;
    const active = pollers_ref.current[trimmed];
    if (!active) return;
    if (active.timeout_id !== null) {
      window.clearTimeout(active.timeout_id);
      active.timeout_id = null;
    }
    active.abort_controller.abort();
    delete pollers_ref.current[trimmed];
  }, []);

  const stop_all = useCallback(() => {
    for (const task_id of Object.keys(pollers_ref.current)) {
      stop_image_task_polling(task_id);
    }
  }, [stop_image_task_polling]);

  const flush_pending_ui_events = useCallback(() => {
    const pending = pending_ui_events_ref.current;
    if (pending.length === 0) return;
    pending_ui_events_ref.current = [];
    set_ui_events((current) => [...current, ...pending]);
  }, []);

  const start_image_task_polling = useCallback(
    ({ task_id }: { task_id: string }) => {
      const trimmed = task_id.trim();
      if (!trimmed) return;
      if (pollers_ref.current[trimmed]) return;

      const abort_controller = new AbortController();
      pollers_ref.current[trimmed] = {
        abort_controller,
        timeout_id: null,
        started_at_ms: Date.now(),
        last_partial_image_index: null,
      };

      const poll_once = async (): Promise<void> => {
        const active = pollers_ref.current[trimmed];
        if (!active || active.abort_controller.signal.aborted) return;

        if (Date.now() - active.started_at_ms > IMAGE_TASK_TIMEOUT_MS) {
          set_ui_events((c) => [
            ...c,
            { type: "image_task_timeout", task_id: trimmed },
          ]);
          stop_image_task_polling(trimmed);
          return;
        }

        try {
          const response = await fetch(
            `/api/realtime/image_task/${encodeURIComponent(trimmed)}`,
            { method: "GET", signal: active.abort_controller.signal }
          );
          const data = await response.json().catch(() => null);

          if (!response.ok) {
            active.timeout_id = window.setTimeout(
              () => void poll_once(),
              POLL_RETRY_DELAY_MS
            );
            return;
          }

          const status =
            typeof data?.status === "string" ? String(data.status).trim() : "";

          // Handle partial images
          const partial_url =
            typeof data?.partial_image_data_url === "string"
              ? String(data.partial_image_data_url)
              : "";
          const partial_idx =
            typeof data?.partial_image_index === "number" &&
            Number.isFinite(data.partial_image_index)
              ? Math.max(0, Math.floor(data.partial_image_index))
              : null;

          if (
            status !== "succeeded" &&
            status !== "failed" &&
            partial_url &&
            partial_idx !== null &&
            (active.last_partial_image_index === null ||
              partial_idx > active.last_partial_image_index)
          ) {
            active.last_partial_image_index = partial_idx;
            set_ui_events((c) => [
              ...c,
              {
                type: "image_task_partial",
                task_id: trimmed,
                partial_image_index: partial_idx,
                image_data_url: partial_url,
              },
            ]);
          }

          if (status === "succeeded") {
            const image_data_url =
              typeof data?.image_data_url === "string"
                ? String(data.image_data_url)
                : "";
            if (image_data_url) {
              const display_event: ui_event = {
                type: "display_image",
                image_data_url,
                display_ms: 5000,
                task_id: trimmed,
              };
              if (is_speaking_ref.current) {
                pending_ui_events_ref.current = [
                  ...pending_ui_events_ref.current,
                  display_event,
                ];
              } else {
                set_ui_events((c) => [...c, display_event]);
              }
            }
            stop_image_task_polling(trimmed);
            return;
          }

          if (status === "failed") {
            const err =
              typeof data?.error === "string"
                ? String(data.error)
                : "Image generation failed";
            set_ui_events((c) => [
              ...c,
              { type: "image_task_failed", task_id: trimmed, error: err },
            ]);
            stop_image_task_polling(trimmed);
            return;
          }

          active.timeout_id = window.setTimeout(
            () => void poll_once(),
            POLL_INTERVAL_MS
          );
        } catch (error) {
          if (active.abort_controller.signal.aborted) return;
          console.warn("[ImageTask] Poll request failed, retrying:", error);
          active.timeout_id = window.setTimeout(
            () => void poll_once(),
            POLL_RETRY_DELAY_MS
          );
        }
      };

      void poll_once();
    },
    [stop_image_task_polling, is_speaking_ref]
  );

  const maybe_start_polling = useCallback(
    ({ ui_events }: { ui_events: unknown[] }) => {
      for (const event of ui_events) {
        if (!is_record(event)) continue;
        if (event["type"] !== "image_task_started") continue;
        const task_id =
          typeof event["task_id"] === "string" ? event["task_id"].trim() : "";
        if (!task_id) continue;
        latest_task_id_ref.current = task_id;
        start_image_task_polling({ task_id });
      }
    },
    [start_image_task_polling]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop_all();
      pending_ui_events_ref.current = [];
    };
  }, [stop_all]);

  return {
    ui_events,
    set_ui_events,
    latest_task_id_ref,
    start_image_task_polling,
    stop_all_image_task_polling: stop_all,
    maybe_start_image_task_polling: maybe_start_polling,
    flush_pending_ui_events,
  };
};
