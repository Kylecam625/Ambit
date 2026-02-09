"use client";

import { useState } from "react";
import { ProfileManager } from "@/components/identity/profile_manager";
import { VoicePicker } from "@/components/ui/voice_picker";
import { MicSelector } from "@/components/ui/mic_selector";
import { VoiceQualitySelector } from "@/components/ui/voice_quality_selector";
import { ThinkingSoundsToggle } from "@/components/ui/thinking_sounds_toggle";
import { SpotifySettings } from "@/components/ui/spotify_settings";
import type {
  identity_profile_summary,
  identity_memory,
  identity_generated_image,
} from "@/lib/identity/identity_types";
import type { memory_cleanup_suggestion } from "@/lib/identity/memory_extractor";

type settings_tab = "audio" | "spotify";

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
  voice_options: Array<{
    voice_id: string;
    name: string;
    preview_url: string | null;
  }>;
  voice_quality: "quality" | "fast";
  on_voice_quality_change: (quality: "quality" | "fast") => void;
  thinking_sounds_enabled: boolean;
  on_thinking_sounds_change: (enabled: boolean) => void;
  profiles: identity_profile_summary[];
  recognized_profile_id: string | null;
  recognized_label: string;
  is_identity_camera_running: boolean;
  is_identity_models_loaded: boolean;
  is_identity_busy: boolean;
  identity_error_message: string | null;
  on_identity_refresh: () => void;
  on_identity_delete_profile: (args: {
    profile_id: string;
    name: string;
  }) => void;
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
  on_identity_capture_enrollment: () => Promise<{
    descriptor: number[];
    thumbnail: string | null;
  } | null>;
  on_identity_add_profile_enrollment: (args: {
    profile_id: string;
  }) => Promise<void> | void;
  on_identity_view_memory: (
    profile_id: string
  ) => Promise<identity_memory | null>;
  on_identity_view_generated_images: (
    profile_id: string
  ) => Promise<identity_generated_image[] | null>;
  on_identity_delete_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;
  on_identity_clear_all_memory: (args: { profile_id: string }) => Promise<boolean>;
  on_identity_analyze_memory: (args: { profile_id: string }) => Promise<memory_cleanup_suggestion | null>;
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
  voice_quality,
  on_voice_quality_change,
  thinking_sounds_enabled,
  on_thinking_sounds_change,
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
  on_identity_clear_all_memory,
  on_identity_analyze_memory,
}: SettingsPanelProps) => {
  const [is_open, set_is_open] = useState(false);
  const [active_tab, set_active_tab] = useState<settings_tab>("audio");
  const [is_voice_picker_open, set_is_voice_picker_open] = useState(false);
  const [is_profiles_open, set_is_profiles_open] = useState(false);

  const close_settings = () => {
    set_is_open(false);
    set_is_voice_picker_open(false);
  };

  const handle_toggle = async () => {
    const next_state = !is_open;
    set_is_open(next_state);
    if (next_state) {
      await on_load_mics();
      await on_load_voices();
    } else {
      set_is_voice_picker_open(false);
    }
  };

  const handle_voice_open_change = async (next_open: boolean) => {
    set_is_voice_picker_open(next_open);
    if (next_open) await on_load_voices();
  };

  const handle_select_voice = (voice_id: string | null) => {
    on_select_voice(voice_id);
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
      {/* Settings gear button */}
      <button
        className="glass-panel rounded-lg p-2.5 text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void handle_toggle()}
        disabled={is_disabled}
        type="button"
        title="Settings"
        aria-label="Open settings"
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
          aria-hidden="true"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.73V12a2 2 0 0 1-1 1.73l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.73v-.5a2 2 0 0 1 1-1.73l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {/* ---------------------------------------------------------------- */}
      {/*  Settings modal                                                   */}
      {/* ---------------------------------------------------------------- */}
      {is_open && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={close_settings}
          />

          {/* Centered card */}
          <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
            <div
              className="glass-panel relative flex w-full max-w-lg flex-col rounded-2xl shadow-2xl animate-fade-in-scale"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Settings"
            >
              {/* ---- Header ---- */}
              <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
                <h3 className="text-lg font-bold text-white">Settings</h3>
                <button
                  className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-100 transition-colors"
                  onClick={close_settings}
                  type="button"
                  aria-label="Close settings"
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
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* ---- Tabs ---- */}
              <div className="flex gap-1 px-5 pt-4 sm:px-6">
                {(["audio", "spotify"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                      active_tab === tab
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                    onClick={() => set_active_tab(tab)}
                    type="button"
                  >
                    {tab === "audio" ? "Audio" : "Spotify"}
                  </button>
                ))}
              </div>

              {/* ---- Scrollable content ---- */}
              <div className="max-h-[65vh] overflow-y-auto px-5 py-5 sm:px-6">
                {/* ================================================= */}
                {/*  Audio tab                                          */}
                {/* ================================================= */}
                {active_tab === "audio" && (
                  <div className="flex flex-col gap-5">
                    {/* Microphone */}
                    <MicSelector
                      is_loading={is_loading_mics}
                      mic_devices={mic_devices}
                      selected_mic_id={selected_mic_id}
                      on_load_mics={on_load_mics}
                      on_select_mic={on_select_mic}
                    />

                    <div className="border-t border-zinc-800" />

                    {/* Voice selection */}
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
                        Voice
                      </label>
                      {voice_error && (
                        <p className="text-xs text-red-400">{voice_error}</p>
                      )}
                      <VoicePicker
                        onOpenChange={handle_voice_open_change}
                        onValueChange={(voice_id) =>
                          handle_select_voice(voice_id || null)
                        }
                        open={is_voice_picker_open}
                        placeholder={
                          is_loading_voices
                            ? "Loading voices..."
                            : "Select a voice..."
                        }
                        value={selected_voice_id ?? ""}
                        voices={voice_options}
                      />
                    </div>

                    <div className="border-t border-zinc-800" />

                    {/* Voice mode */}
                    <VoiceQualitySelector
                      quality={voice_quality}
                      on_change={on_voice_quality_change}
                    />

                    <div className="border-t border-zinc-800" />

                    {/* Loading sounds */}
                    <ThinkingSoundsToggle
                      enabled={thinking_sounds_enabled}
                      on_change={on_thinking_sounds_change}
                    />
                  </div>
                )}

                {/* ================================================= */}
                {/*  Spotify tab                                        */}
                {/* ================================================= */}
                {active_tab === "spotify" && (
                  <SpotifySettings />
                )}
              </div>

              {/* ---- Footer: Profiles ---- */}
              <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-4 sm:px-6">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-400">
                    Profiles
                  </span>
                  <span className="text-sm text-zinc-500">
                    {profiles.length} total
                  </span>
                </div>
                <button
                  className="rounded-lg border-2 border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-bold text-zinc-100 hover:border-zinc-500 disabled:opacity-50 transition-colors"
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
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/*  Profiles modal (unchanged)                                       */}
      {/* ---------------------------------------------------------------- */}
      {is_profiles_open && (
        <div className="fixed inset-0 z-40 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-lg"
            onClick={() => set_is_profiles_open(false)}
          />
          <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
          <div
            className="glass-panel relative w-full max-w-4xl rounded-2xl p-5 sm:p-7 shadow-2xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Manage profiles"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
                  Profiles
                </p>
                <p className="text-base text-zinc-200">
                  Manage profiles and enrollments.
                </p>
              </div>
              <button
                className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-bold text-zinc-100 disabled:opacity-50 hover:border-zinc-500 transition-colors"
                onClick={() => set_is_profiles_open(false)}
                disabled={is_identity_busy}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-5">
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
                on_clear_all_memory={on_identity_clear_all_memory}
                on_analyze_memory={on_identity_analyze_memory}
              />
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
