"use client";

type ui_event = {
  type: string;
  [key: string]: unknown;
};

const find_latest_task_id = (ui_events: ui_event[]): string | null => {
  for (let i = ui_events.length - 1; i >= 0; i -= 1) {
    const e = ui_events[i];
    if (!e || typeof e !== "object") continue;
    if (e.type !== "image_task_started") continue;
    const task_id = typeof e["task_id"] === "string" ? e["task_id"].trim() : "";
    if (!task_id) continue;
    return task_id;
  }
  return null;
};

const is_task_terminal = ({ ui_events, task_id }: { ui_events: ui_event[]; task_id: string }) =>
  ui_events.some(
    (e) =>
      e &&
      typeof e === "object" &&
      ((e.type === "display_image" && e["task_id"] === task_id) ||
        (e.type === "image_task_failed" && e["task_id"] === task_id) ||
        (e.type === "image_task_timeout" && e["task_id"] === task_id))
  );

const find_latest_partial_preview = ({
  ui_events,
  task_id,
}: {
  ui_events: ui_event[];
  task_id: string;
}): string | null => {
  for (let i = ui_events.length - 1; i >= 0; i -= 1) {
    const e = ui_events[i];
    if (!e || typeof e !== "object") continue;
    if (e.type !== "image_task_partial") continue;
    if (e["task_id"] !== task_id) continue;
    const image_data_url = typeof e["image_data_url"] === "string" ? String(e["image_data_url"]) : "";
    if (!image_data_url) continue;
    return image_data_url;
  }
  return null;
};

export const ImageTaskToast = ({ ui_events }: { ui_events: ui_event[] }) => {
  const task_id = find_latest_task_id(ui_events);
  if (!task_id) return null;
  if (is_task_terminal({ ui_events, task_id })) return null;

  const preview = find_latest_partial_preview({ ui_events, task_id });

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/85 px-4 py-3 shadow-2xl backdrop-blur-md">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Generating preview"
            className="h-12 w-12 rounded-xl object-cover"
          />
        ) : (
          <div className="h-12 w-12 animate-pulse rounded-xl bg-zinc-800" />
        )}

        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">Generating image…</p>
          <p className="text-xs text-zinc-400">I&apos;ll pop it up when it&apos;s ready.</p>
        </div>
      </div>
    </div>
  );
};

