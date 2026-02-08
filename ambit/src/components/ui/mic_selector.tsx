"use client";

import { useState } from "react";

type MicSelectorProps = {
  is_loading: boolean;
  mic_devices: Array<{ device_id: string; label: string }>;
  selected_mic_id: string | null;
  on_load_mics: () => Promise<void> | void;
  on_select_mic: (device_id: string | null) => void;
};

export const MicSelector = ({
  is_loading,
  mic_devices,
  selected_mic_id,
  on_load_mics,
  on_select_mic,
}: MicSelectorProps) => {
  const [is_open, set_is_open] = useState(false);

  const selected_label =
    mic_devices.find((d) => d.device_id === selected_mic_id)?.label ??
    "System default";

  const handle_toggle = async () => {
    const next = !is_open;
    set_is_open(next);
    if (next) await on_load_mics();
  };

  const handle_select = (device_id: string | null) => {
    on_select_mic(device_id);
    set_is_open(false);
    if (typeof window !== "undefined") {
      if (device_id) {
        localStorage.setItem("ambit_selected_mic_id", device_id);
      } else {
        localStorage.removeItem("ambit_selected_mic_id");
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
        Microphone
      </label>
      <button
        className="flex w-full items-center justify-between gap-3 rounded-lg border-2 border-zinc-700 bg-black/80 px-4 py-2.5 text-left text-sm font-bold text-zinc-100 hover:border-zinc-500"
        onClick={() => void handle_toggle()}
        type="button"
      >
        <span className="min-w-0 truncate">
          {is_loading ? "Loading microphones..." : selected_label}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-zinc-400 transition-transform ${is_open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {is_open && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border-2 border-zinc-700 bg-zinc-950 p-2">
          <div className="flex flex-col gap-1">
            <button
              className={`rounded-md border-2 px-3 py-2 text-left text-sm font-bold ${
                selected_mic_id === null
                  ? "border-zinc-100 text-white"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
              onClick={() => handle_select(null)}
              type="button"
            >
              System default
            </button>
            {mic_devices.map((device) => (
              <button
                key={device.device_id}
                className={`rounded-md border-2 px-3 py-2 text-left text-sm font-bold ${
                  device.device_id === selected_mic_id
                    ? "border-zinc-100 text-white"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
                onClick={() => handle_select(device.device_id)}
                type="button"
              >
                <span className="block truncate">{device.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
