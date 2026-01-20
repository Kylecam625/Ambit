"use client";

import { FullscreenButton } from "@/components/ui/fullscreen_button";
import { SettingsPanel } from "@/components/ui/settings_panel";
import type {
  identity_generated_image,
  identity_memory,
  identity_profile_summary,
} from "@/lib/identity/identity_types";

const pill = ({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) => {
  const tone_classes =
    tone === "ok"
      ? "border-emerald-700/50 text-emerald-200"
      : tone === "warn"
        ? "border-amber-700/50 text-amber-200"
        : tone === "bad"
          ? "border-red-700/50 text-red-200"
          : "border-zinc-800 text-zinc-200";

  return (
    <span className={`rounded-full border bg-black/40 px-2 py-1 text-[11px] ${tone_classes}`}>
      <span className="text-zinc-500">{label}</span> {value}
    </span>
  );
};

export const MouthTopBar = ({
  is_loading_mics,
  is_loading_voices,
  mic_devices,
  selected_mic_id,
  selected_voice_id,
  voice_error,
  voice_options,
  on_load_voices,
  on_load_mics,
  on_select_voice,
  on_select_mic,

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

  state_label,
  state_tone,
  is_connected,
}: {
  // STT / voice settings
  is_loading_mics: boolean;
  is_loading_voices: boolean;
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
  on_identity_view_generated_images: (profile_id: string) => Promise<identity_generated_image[] | null>;
  on_identity_delete_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;

  // Status
  state_label: string;
  state_tone: "neutral" | "ok" | "warn" | "bad";
  is_connected: boolean;
}) => {
  const selected_mic_label =
    mic_devices.find((d) => d.device_id === selected_mic_id)?.label ?? "Default";
  const selected_voice_label =
    voice_options.find((v) => v.voice_id === selected_voice_id)?.name ?? "Voice";

  const identity_tone = is_identity_camera_running && is_identity_models_loaded ? "ok" : "warn";
  const connection_tone = is_connected ? "ok" : "warn";

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <FullscreenButton />
        {pill({ label: "state", value: state_label, tone: state_tone })}
        {pill({ label: "conn", value: is_connected ? "on" : "off", tone: connection_tone })}
        {pill({ label: "id", value: recognized_label || "Anonymous", tone: identity_tone })}
        <span className="hidden sm:inline">
          {pill({ label: "mic", value: selected_mic_label })}
        </span>
        <span className="hidden sm:inline">
          {pill({ label: "voice", value: selected_voice_label })}
        </span>
      </div>

      <SettingsPanel
        is_loading_mics={is_loading_mics}
        is_loading_voices={is_loading_voices}
        is_disabled={false}
        mic_devices={mic_devices}
        on_load_voices={on_load_voices}
        on_load_mics={on_load_mics}
        on_select_voice={on_select_voice}
        on_select_mic={on_select_mic}
        selected_mic_id={selected_mic_id}
        selected_voice_id={selected_voice_id}
        voice_error={voice_error}
        voice_options={voice_options}
        profiles={profiles}
        recognized_profile_id={recognized_profile_id}
        recognized_label={recognized_label}
        is_identity_camera_running={is_identity_camera_running}
        is_identity_models_loaded={is_identity_models_loaded}
        is_identity_busy={is_identity_busy}
        identity_error_message={identity_error_message}
        on_identity_refresh={on_identity_refresh}
        on_identity_delete_profile={on_identity_delete_profile}
        on_identity_create_profile={on_identity_create_profile}
        on_identity_capture_enrollment={on_identity_capture_enrollment}
        on_identity_view_memory={on_identity_view_memory}
        on_identity_view_generated_images={on_identity_view_generated_images}
        on_identity_delete_memory_item={on_identity_delete_memory_item}
      />
    </div>
  );
};

