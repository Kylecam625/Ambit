"use client";

import { SettingsPanel } from "@/components/ui/settings_panel";
import type {
  identity_generated_image,
  identity_memory,
  identity_profile_summary,
} from "@/lib/identity/identity_types";
import type { ReactNode } from "react";

type tone = "neutral" | "ok" | "warn" | "bad";

const tone_border: Record<tone, string> = {
  neutral: "border-zinc-800/80",
  ok: "border-emerald-700/40",
  warn: "border-amber-700/40",
  bad: "border-red-700/40",
};

const tone_dot: Record<tone, string> = {
  neutral: "bg-zinc-400/70",
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-red-400",
};

const Chip = ({
  tone = "neutral",
  className = "",
  title,
  children,
}: {
  tone?: tone;
  className?: string;
  title?: string;
  children: ReactNode;
}) => {
  return (
    <div
      className={`inline-flex min-w-0 items-center gap-2 whitespace-nowrap rounded-full border bg-black/30 px-3 py-1.5 text-[12px] text-zinc-100 backdrop-blur ${tone_border[tone]} ${className}`}
      title={title}
    >
      {children}
    </div>
  );
};

const Dot = ({ tone = "neutral" }: { tone?: tone }) => (
  <span className={`h-2 w-2 shrink-0 rounded-full ${tone_dot[tone]}`} aria-hidden="true" />
);

const capitalize = (value: string) => (value ? value[0]!.toUpperCase() + value.slice(1) : value);

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
  voice_quality,
  on_voice_quality_change,
  thinking_sounds_enabled,
  on_thinking_sounds_change,

  profiles,
  recognized_profile_id,
  recognized_label,
  identity_pill_value,
  identity_pill_tone,
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
  voice_quality: "quality" | "fast";
  on_voice_quality_change: (quality: "quality" | "fast") => void;
  thinking_sounds_enabled: boolean;
  on_thinking_sounds_change: (enabled: boolean) => void;

  // Identity / Profiles
  profiles: identity_profile_summary[];
  recognized_profile_id: string | null;
  recognized_label: string;
  identity_pill_value?: string;
  identity_pill_tone?: tone;
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
  on_identity_view_generated_images: (profile_id: string) => Promise<identity_generated_image[] | null>;
  on_identity_delete_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;

  // Status
  state_label: string;
  state_tone: tone;
  is_connected: boolean;
}) => {
  const selected_mic_label =
    mic_devices.find((d) => d.device_id === selected_mic_id)?.label ?? "System";
  const selected_voice_label =
    voice_options.find((v) => v.voice_id === selected_voice_id)?.name ??
    (selected_voice_id ? "Voice" : "Auto");

  const identity_value = identity_pill_value ?? (recognized_label || "Anonymous");
  const identity_tone =
    identity_pill_tone ??
    (is_identity_camera_running && is_identity_models_loaded && Boolean(recognized_profile_id)
      ? "ok"
      : "warn");
  const identity_title = identity_error_message
    ? `Identity: ${identity_value} • ${identity_error_message}`
    : `Identity: ${identity_value}`;
  const connection_tone: tone = is_connected ? "ok" : "warn";
  const should_show_audio = Boolean(selected_mic_id) || Boolean(selected_voice_id);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Chip
          tone={state_tone}
          title={`State: ${capitalize(state_label)} • ${is_connected ? "Online" : "Offline"}`}
        >
          <Dot tone={connection_tone} />
          <span className="font-semibold">{capitalize(state_label)}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400">{is_connected ? "Online" : "Offline"}</span>
        </Chip>

        <Chip tone={identity_tone} className="min-w-0" title={identity_title}>
          <Dot tone={identity_tone} />
          <span className="min-w-0 truncate">{identity_value}</span>
        </Chip>

        {should_show_audio ? (
          <Chip
            tone="neutral"
            className="hidden min-w-0 lg:inline-flex"
            title={`Mic: ${selected_mic_label} • Voice: ${selected_voice_label}`}
          >
            <span className="text-zinc-500">Mic</span>
            <span className="min-w-0 max-w-[220px] truncate">{selected_mic_label}</span>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-500">Voice</span>
            <span className="min-w-0 max-w-[220px] truncate">{selected_voice_label}</span>
          </Chip>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
          voice_quality={voice_quality}
          on_voice_quality_change={on_voice_quality_change}
          thinking_sounds_enabled={thinking_sounds_enabled}
          on_thinking_sounds_change={on_thinking_sounds_change}
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
          on_identity_update_profile={on_identity_update_profile}
          on_identity_capture_enrollment={on_identity_capture_enrollment}
          on_identity_add_profile_enrollment={on_identity_add_profile_enrollment}
          on_identity_view_memory={on_identity_view_memory}
          on_identity_view_generated_images={on_identity_view_generated_images}
          on_identity_delete_memory_item={on_identity_delete_memory_item}
        />
      </div>
    </div>
  );
};

