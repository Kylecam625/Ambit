"use client";

import { useEffect, useState } from "react";
import { VoicePicker } from "@/components/ui/voice_picker";

type SettingsPanelProps = {
  is_loading_mics: boolean;
  is_loading_voices: boolean;
  is_disabled: boolean;
  mic_devices: Array<{ device_id: string; label: string }>;
  on_load_voices: () => Promise<void> | void;
  on_load_mics: () => Promise<void> | void;
  on_select_voice: (voice_id: string | null) => void;
  on_select_mic: (device_id: string | null) => void;
  selected_mic_id: string | null;
  selected_voice_id: string | null;
  voice_error: string | null;
  voice_options: Array<{ voice_id: string; name: string; preview_url: string | null }>;
};

export const SettingsPanel = ({
  is_loading_mics,
  is_loading_voices,
  is_disabled,
  mic_devices,
  on_load_voices,
  on_load_mics,
  on_select_voice,
  on_select_mic,
  selected_mic_id,
  selected_voice_id,
  voice_error,
  voice_options,
}: SettingsPanelProps) => {
  const [is_open, set_is_open] = useState(false);
  const [is_voice_picker_open, set_is_voice_picker_open] = useState(false);

  const selected_mic_label =
    mic_devices.find((device) => device.device_id === selected_mic_id)?.label ??
    "System default";

  const handle_toggle = async () => {
    const next_state = !is_open;
    set_is_open(next_state);

    if (next_state) {
      await on_load_mics();
      await on_load_voices();
    }
  };

  const handle_voice_open_change = async (next_open: boolean) => {
    set_is_voice_picker_open(next_open);

    if (next_open) {
      await on_load_voices();
    }
  };

  const handle_select_mic = (device_id: string | null) => {
    on_select_mic(device_id);
    // Save to localStorage
    if (typeof window !== "undefined") {
      if (device_id) {
        localStorage.setItem("ambit_selected_mic_id", device_id);
      } else {
        localStorage.removeItem("ambit_selected_mic_id");
      }
    }
  };

  const handle_select_voice = (voice_id: string | null) => {
    on_select_voice(voice_id);
    // Save to localStorage
    if (typeof window !== "undefined") {
      if (voice_id) {
        localStorage.setItem("ambit_selected_voice_id", voice_id);
      } else {
        localStorage.removeItem("ambit_selected_voice_id");
      }
    }
  };

  return (
    <div className="relative">
      {/* Settings Button */}
      <button
        className="rounded-full border border-zinc-700 bg-zinc-900 p-3 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={handle_toggle}
        disabled={is_disabled}
        type="button"
        title="Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
        </svg>
      </button>

      {/* Settings Dropdown */}
      {is_open && (
        <div className="absolute right-0 top-14 z-50 w-96 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-100">Settings</h3>
              <button
                className="text-zinc-400 hover:text-zinc-100"
                onClick={() => set_is_open(false)}
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Microphone Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Microphone
              </label>
              <p className="text-xs text-zinc-400">Current: {selected_mic_label}</p>
              {is_loading_mics ? (
                <p className="text-sm text-zinc-400">Loading microphones...</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    className={`rounded-xl border px-4 py-2 text-left text-sm font-semibold ${
                      selected_mic_id === null
                        ? "border-zinc-100 text-zinc-100"
                        : "border-zinc-700 text-zinc-300"
                    }`}
                    onClick={() => handle_select_mic(null)}
                    type="button"
                  >
                    System default
                  </button>
                  {mic_devices.map((device) => (
                    <button
                      key={device.device_id}
                      className={`rounded-xl border px-4 py-2 text-left text-sm font-semibold ${
                        device.device_id === selected_mic_id
                          ? "border-zinc-100 text-zinc-100"
                          : "border-zinc-700 text-zinc-300"
                      }`}
                      onClick={() => handle_select_mic(device.device_id)}
                      type="button"
                    >
                      {device.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Voice Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Voice
              </label>
              {voice_error && (
                <p className="text-xs text-red-400">{voice_error}</p>
              )}
              <VoicePicker
                onOpenChange={handle_voice_open_change}
                onValueChange={(voice_id) => handle_select_voice(voice_id || null)}
                open={is_voice_picker_open}
                placeholder={is_loading_voices ? "Loading voices..." : "Select a voice..."}
                value={selected_voice_id ?? ""}
                voices={voice_options}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
