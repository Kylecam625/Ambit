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
    phone_number: string | null;
    sms_consent: boolean;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
  }) => void;
  on_identity_update_profile: (args: {
    profile_id: string;
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
  }) => void;
  on_identity_capture_enrollment: () => Promise<{ descriptor: number[]; thumbnail: string | null } | null>;
  on_identity_add_profile_enrollment: (args: { profile_id: string }) => Promise<void> | void;
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
  on_identity_update_profile,
  on_identity_capture_enrollment,
  on_identity_add_profile_enrollment,
  on_identity_view_memory,
  on_identity_view_generated_images,
  on_identity_delete_memory_item,
}: SettingsPanelProps) => {
  const [is_open, set_is_open] = useState(false);
  const [is_voice_picker_open, set_is_voice_picker_open] = useState(false);
  const [is_mic_picker_open, set_is_mic_picker_open] = useState(false);
  const [is_profiles_open, set_is_profiles_open] = useState(false);
  const [is_calendar_loading, set_is_calendar_loading] = useState(false);
  const [calendar_connected, set_calendar_connected] = useState<boolean | null>(null);
  const [calendar_error, set_calendar_error] = useState<string | null>(null);

  const selected_mic_label =
    mic_devices.find((device) => device.device_id === selected_mic_id)?.label ??
    "System default";

  const close_settings = () => {
    set_is_open(false);
    set_is_voice_picker_open(false);
    set_is_mic_picker_open(false);
  };

  const calendar_profile_id = recognized_profile_id ?? "anonymous";

  const build_return_to = (): string => {
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}`;
  };

  const load_calendar_status = async (): Promise<void> => {
    set_is_calendar_loading(true);
    set_calendar_error(null);
    try {
      const response = await fetch(
        `/api/google_calendar/status?profile_id=${encodeURIComponent(calendar_profile_id)}`
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to load calendar status";
        throw new Error(message);
      }
      set_calendar_connected(Boolean(data?.connected));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load calendar status";
      set_calendar_error(message);
      set_calendar_connected(null);
    } finally {
      set_is_calendar_loading(false);
    }
  };

  const disconnect_calendar = async (): Promise<void> => {
    set_is_calendar_loading(true);
    set_calendar_error(null);
    try {
      const response = await fetch("/api/google_calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: calendar_profile_id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to disconnect calendar";
        throw new Error(message);
      }
      set_calendar_connected(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect calendar";
      set_calendar_error(message);
    } finally {
      set_is_calendar_loading(false);
    }
  };

  const handle_toggle = async () => {
    const next_state = !is_open;
    set_is_open(next_state);

    if (next_state) {
      await on_load_mics();
      await on_load_voices();
      await load_calendar_status();
    } else {
      set_is_voice_picker_open(false);
      set_is_mic_picker_open(false);
    }
  };

  const handle_toggle_mic_picker = async () => {
    const next_state = !is_mic_picker_open;
    set_is_mic_picker_open(next_state);

    if (next_state) {
      await on_load_mics();
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
    set_is_mic_picker_open(false);
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
        className="rounded-full border border-zinc-800/80 bg-black/30 p-3 text-zinc-300 backdrop-blur hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
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
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.73V12a2 2 0 0 1-1 1.73l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.73v-.5a2 2 0 0 1 1-1.73l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {/* Settings Dropdown */}
      {is_open && (
        <div className="absolute right-0 top-12 z-50 w-[min(340px,calc(100vw-1.5rem))] rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-100">Settings</h3>
              <button
                className="text-zinc-400 hover:text-zinc-100"
                onClick={close_settings}
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
              <button
                className="flex w-full items-center justify-between gap-3 rounded-full border border-zinc-800 bg-black/40 px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-700"
                onClick={() => void handle_toggle_mic_picker()}
                type="button"
              >
                <span className="min-w-0 truncate">
                  {is_loading_mics ? "Loading microphones..." : selected_mic_label}
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
                  className={`shrink-0 text-zinc-400 transition-transform ${is_mic_picker_open ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {is_mic_picker_open ? (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-2">
                  <div className="flex flex-col gap-1">
                    <button
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                        selected_mic_id === null
                          ? "border-zinc-100 text-zinc-100"
                          : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                      onClick={() => handle_select_mic(null)}
                      type="button"
                    >
                      System default
                    </button>
                    {mic_devices.map((device) => (
                      <button
                        key={device.device_id}
                        className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                          device.device_id === selected_mic_id
                            ? "border-zinc-100 text-zinc-100"
                            : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        }`}
                        onClick={() => handle_select_mic(device.device_id)}
                        type="button"
                      >
                        <span className="block truncate">{device.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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

            {/* Calendar */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Calendar
              </label>
              {calendar_error ? (
                <p className="text-xs text-red-400">{calendar_error}</p>
              ) : (
                <p className="text-xs text-zinc-400">
                  Status:{" "}
                  {is_calendar_loading
                    ? "Checking..."
                    : calendar_connected === true
                      ? "Connected"
                      : calendar_connected === false
                        ? "Not connected"
                        : "Unknown"}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <a
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-600"
                  href={`/api/google_calendar/connect?profile_id=${encodeURIComponent(
                    calendar_profile_id
                  )}&return_to=${encodeURIComponent(build_return_to())}`}
                >
                  Connect Google Calendar
                </a>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void disconnect_calendar()}
                    disabled={is_calendar_loading}
                    type="button"
                    title="Disconnect Calendar"
                  >
                    Disconnect
                  </button>
                  <button
                    className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void load_calendar_status()}
                    disabled={is_calendar_loading}
                    type="button"
                    title="Refresh Calendar Status"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Profiles */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Profiles
              </label>
              <p className="text-xs text-zinc-400">{profiles.length} total</p>
              <button
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:border-zinc-600 disabled:opacity-50"
                onClick={() => {
                  close_settings();
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
                on_update_profile={on_identity_update_profile}
                on_capture_enrollment={on_identity_capture_enrollment}
                on_add_profile_enrollment={on_identity_add_profile_enrollment}
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
