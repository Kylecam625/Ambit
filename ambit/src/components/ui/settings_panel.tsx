"use client";

import { useState } from "react";
import { ProfileManager } from "@/components/identity/profile_manager";
import { VoicePicker } from "@/components/ui/voice_picker";
import type {
  identity_profile_summary,
  identity_memory,
  identity_generated_image,
} from "@/lib/identity/identity_types";

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

  // Identity / Profiles
  profiles: identity_profile_summary[];
  recognized_profile_id: string | null;
  recognized_label: string;
  is_identity_camera_running: boolean;
  is_identity_models_loaded: boolean;
  is_identity_busy: boolean;
  identity_error_message: string | null;
  on_identity_refresh: () => void;
  on_identity_delete_profile: (args: { profile_id: string; name: string }) => void;
  on_identity_create_profile: (args: {
    name: string;
    age: number | null;
    interests: string;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
  }) => void;
  on_identity_capture_enrollment: () => Promise<{ descriptor: number[]; thumbnail: string | null } | null>;
  on_identity_view_memory: (profile_id: string) => Promise<identity_memory | null>;
  on_identity_view_generated_images: (
    profile_id: string
  ) => Promise<identity_generated_image[] | null>;
  on_identity_delete_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;
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
  profiles,
  recognized_profile_id,
  recognized_label,
  is_identity_camera_running,
  is_identity_models_loaded,
  is_identity_busy,
  identity_error_message,
  on_identity_refresh,
  on_identity_delete_profile,
  on_identity_create_profile,
  on_identity_capture_enrollment,
  on_identity_view_memory,
  on_identity_view_generated_images,
  on_identity_delete_memory_item,
}: SettingsPanelProps) => {
  const [is_open, set_is_open] = useState(false);
  const [is_voice_picker_open, set_is_voice_picker_open] = useState(false);
  const [is_profiles_open, set_is_profiles_open] = useState(false);

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

            {/* Profiles */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Profiles
              </label>
              <p className="text-xs text-zinc-400">{profiles.length} total</p>
              <button
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
                onClick={() => {
                  set_is_open(false);
                  set_is_profiles_open(true);
                }}
                disabled={is_disabled}
                type="button"
              >
                Manage Profiles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profiles Modal */}
      {is_profiles_open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => set_is_profiles_open(false)}
          />
          <div
            className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Profiles
                </p>
                <p className="text-sm text-zinc-300">Manage profiles and enrollments.</p>
              </div>

              <button
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
                onClick={() => set_is_profiles_open(false)}
                disabled={is_identity_busy}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <ProfileManager
                profiles={profiles}
                is_camera_running={is_identity_camera_running}
                is_models_loaded={is_identity_models_loaded}
                is_busy={is_identity_busy}
                error_message={identity_error_message}
                recognized_profile_id={recognized_profile_id}
                recognized_label={recognized_label}
                on_refresh={on_identity_refresh}
                on_delete_profile={on_identity_delete_profile}
                on_create_profile={on_identity_create_profile}
                on_capture_enrollment={on_identity_capture_enrollment}
                on_view_memory={on_identity_view_memory}
                on_view_generated_images={on_identity_view_generated_images}
                on_delete_memory_item={on_identity_delete_memory_item}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
