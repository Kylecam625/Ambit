"use client";

import Link from "next/link";
import { SettingsPanel } from "@/components/ui/settings_panel";
import type {
  identity_generated_image,
  identity_memory,
  identity_profile_summary,
} from "@/lib/identity/identity_types";
import type { memory_cleanup_suggestion } from "@/lib/identity/memory_extractor";
import type { ReactNode } from "react";

type tone = "neutral" | "ok" | "warn" | "bad";

const tone_dot: Record<tone, string> = {
  neutral: "bg-zinc-500",
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
      className={`glass-panel inline-flex min-w-0 items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-semibold text-zinc-200 ${className}`}
      title={title}
    >
      {children}
    </div>
  );
};

const Dot = ({ tone = "neutral" }: { tone?: tone }) => (
  <span className={`h-2 w-2 shrink-0 rounded-sm ${tone_dot[tone]}`} aria-hidden="true" />
);

const capitalize = (value: string) => (value ? value[0]!.toUpperCase() + value.slice(1) : value);

const EMOTION_EMOJI: Record<string, string> = {
  happy: "\u{1F60A}",
  sad: "\u{1F614}",
  angry: "\u{1F620}",
  fearful: "\u{1F628}",
  disgusted: "\u{1F612}",
  surprised: "\u{1F632}",
};

const MOOD_EMOJI: Record<string, string> = {
  excited: "\u{26A1}",
  calm: "\u{1F30A}",
  intense: "\u{1F525}",
  playful: "\u{2728}",
  warm: "\u{2600}\uFE0F",
  mysterious: "\u{1F319}",
  sad: "\u{1F327}\uFE0F",
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
  on_identity_clear_all_memory,
  on_identity_analyze_memory,

  state_label,
  state_tone,
  is_connected,

  detected_emotion = null,
  ui_mood = null,
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
  on_identity_clear_all_memory: (args: { profile_id: string }) => Promise<boolean>;
  on_identity_analyze_memory: (args: { profile_id: string }) => Promise<memory_cleanup_suggestion | null>;

  // Status
  state_label: string;
  state_tone: tone;
  is_connected: boolean;

  // Emotion
  detected_emotion?: string | null;
  ui_mood?: string | null;
}) => {
  const identity_value = identity_pill_value ?? (recognized_label || "Anonymous");
  const identity_tone =
    identity_pill_tone ??
    (is_identity_camera_running && is_identity_models_loaded && Boolean(recognized_profile_id)
      ? "ok"
      : "warn");
  const identity_title = identity_error_message
    ? `Identity: ${identity_value} \u2022 ${identity_error_message}`
    : `Identity: ${identity_value}`;
  const connection_tone: tone = is_connected ? "ok" : "warn";

  return (
    <div className="flex items-center justify-between gap-2 animate-fade-in delay-100">
      {/* Left: status chips */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Chip
          tone={state_tone}
          title={`State: ${capitalize(state_label)} \u2022 ${is_connected ? "Online" : "Offline"}`}
        >
          <Dot tone={connection_tone} />
          <span className="font-medium">{capitalize(state_label)}</span>
        </Chip>

        <Chip tone={identity_tone} className="min-w-0" title={identity_title}>
          <Dot tone={identity_tone} />
          <span className="min-w-0 truncate max-w-[120px]">{identity_value}</span>
        </Chip>

        <div
          className="transition-all duration-700 ease-in-out overflow-hidden"
          style={{
            opacity: detected_emotion && detected_emotion !== "neutral" ? 0.7 : 0,
            maxWidth: detected_emotion && detected_emotion !== "neutral" ? "160px" : "0px",
            transform: detected_emotion && detected_emotion !== "neutral" ? "scale(1)" : "scale(0.9)",
          }}
        >
          <Chip tone="neutral" className="min-w-0" title={`Expression: ${detected_emotion}`}>
            <span className="min-w-0 truncate max-w-[100px] text-[11px]">
              {EMOTION_EMOJI[detected_emotion ?? ""] ?? ""} {capitalize(detected_emotion ?? "")}
            </span>
          </Chip>
        </div>

        <div
          className="transition-all duration-700 ease-in-out overflow-hidden"
          style={{
            opacity: ui_mood && ui_mood !== "neutral" ? 0.7 : 0,
            maxWidth: ui_mood && ui_mood !== "neutral" ? "160px" : "0px",
            transform: ui_mood && ui_mood !== "neutral" ? "scale(1)" : "scale(0.9)",
          }}
        >
          <Chip tone="ok" className="min-w-0" title={`Mood: ${ui_mood}`}>
            <span className="min-w-0 truncate max-w-[100px] text-[11px]">
              {MOOD_EMOJI[ui_mood ?? ""] ?? ""} {capitalize(ui_mood ?? "")}
            </span>
          </Chip>
        </div>
      </div>

      {/* Right: journal + settings gear */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Journal button — only visible when a profile is recognized */}
        {recognized_profile_id && (
          <Link
            href={`/journal?profile_id=${encodeURIComponent(recognized_profile_id)}&name=${encodeURIComponent(recognized_label)}`}
            className="glass-panel inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold text-zinc-300 hover:text-amber-200 transition-colors"
            title="Open Journal"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400/70">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Journal
          </Link>
        )}
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
          on_identity_clear_all_memory={on_identity_clear_all_memory}
          on_identity_analyze_memory={on_identity_analyze_memory}
        />
      </div>
    </div>
  );
};
