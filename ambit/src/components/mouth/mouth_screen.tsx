"use client";

import { useEffect, useRef, useState } from "react";
import { MouthTopBar } from "@/components/mouth/mouth_top_bar";
import { MouthTranscriptBar } from "@/components/mouth/mouth_transcript_bar";
import { MouthWaves } from "@/components/mouth/mouth_waves";
import { useRealtimeStt } from "@/hooks/use_realtime_stt";
import { capture_frame_data_url_async } from "@/lib/identity/camera_browser";
import { useIdentityRuntime } from "@/lib/identity/use_identity_runtime";
import type { AgentState } from "@/components/ui/bar_visualizer";
import { useWindowSize } from "@/lib/ui/use_window_size";
import { GeneratedImageOverlay } from "@/components/ui/generated_image_overlay";
import { ImageTaskToast } from "@/components/ui/image_task_toast";

export const MouthScreen = () => {
  const [active_profile_id, set_active_profile_id] = useState<string | null>(null);
  const identity_video_ref = useRef<HTMLVideoElement | null>(null);
  const { width, height } = useWindowSize();
  void width;
  void height;

  const identity = useIdentityRuntime({
    active_profile_id,
    on_change_active_profile_id: set_active_profile_id,
    on_identity_expired: () => set_active_profile_id(null),
    video_ref: identity_video_ref,
  });

  useEffect(() => {
    const recognized = identity.recognized_profile_id;
    if (!recognized) return;
    if (active_profile_id === recognized) return;
    set_active_profile_id(recognized);
  }, [active_profile_id, identity.recognized_profile_id]);

  const {
    is_connected,
    is_loading_mics,
    is_loading_voices,
    is_responding,
    is_speaking,
    is_tts_playing,
    load_mics,
    load_voices,
    mic_devices,
    select_voice,
    select_mic,
    selected_mic_id,
    selected_voice_id,
    voice_error,
    voice_options,
    start_realtime,
    stop_realtime,
    transcript,
    response_text,
    ui_events,
    reset_conversation,
    cancel_inflight,
    tts_audio_element,
  } = useRealtimeStt({
    profile_id: active_profile_id,
    capture_camera_frame: async () => {
      const video_el = identity_video_ref.current;
      if (!video_el) return null;
      return await capture_frame_data_url_async({
        video_el,
        max_size: 512,
        mime: "image/jpeg",
        quality: 0.85,
        mirror: true,
      });
    },
  });

  // Mirror main page behavior: if identity switches profiles, cancel in-flight output.
  const last_profile_id_ref = useRef<string | null>(active_profile_id);
  useEffect(() => {
    const prev = last_profile_id_ref.current;
    const next = active_profile_id;
    if (prev === next) return;
    cancel_inflight();
    last_profile_id_ref.current = next;
  }, [active_profile_id, cancel_inflight]);

  useEffect(() => {
    if (active_profile_id !== null) return;
    reset_conversation();
  }, [active_profile_id, reset_conversation]);

  // Auto-start on mount (kiosk-friendly).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!is_connected) start_realtime();
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state: AgentState = is_responding
    ? "thinking"
    : is_tts_playing
      ? "speaking"
      : is_connected || is_speaking
        ? "listening"
        : "initializing";

  const recognized_name = (() => {
    const id = identity.recognized_profile_id;
    if (!id) return "Anonymous";
    const match = identity.profiles.find((p) => p.profile_id === id);
    return match ? match.name : "Anonymous";
  })();

  const { identity_label, identity_tone } = (() => {
    if (identity.models_error)
      return { identity_label: identity.models_error, identity_tone: "bad" as const };
    if (identity.connection_error)
      return { identity_label: "Svc off", identity_tone: "warn" as const };
    if (!identity.is_models_loaded) return { identity_label: "Loading", identity_tone: "warn" as const };
    if (!identity.is_camera_running) return { identity_label: "Off", identity_tone: "warn" as const };
    if (identity.recognized_profile_id)
      return { identity_label: recognized_name, identity_tone: "ok" as const };
    if (identity.is_detected) return { identity_label: "Unknown", identity_tone: "warn" as const };
    return { identity_label: "No face", identity_tone: "warn" as const };
  })();

  const identity_error_message =
    identity.profile_action_error ?? identity.connection_error ?? identity.models_error;
  void response_text;
  void stop_realtime;
  void start_realtime;

  return (
    <div className="h-[100dvh] w-[100dvw] overflow-hidden bg-black text-zinc-100 select-none touch-manipulation">
      <GeneratedImageOverlay ui_events={ui_events} />
      <ImageTaskToast ui_events={ui_events} />
      <main className="mx-auto flex h-full w-full max-w-[980px] flex-col gap-[clamp(10px,2.2vw,16px)] px-[clamp(10px,2.6vw,18px)] py-[clamp(10px,2.6vw,18px)]">
        <div className="shrink-0">
          <MouthTopBar
            // STT
            is_loading_mics={is_loading_mics}
            is_loading_voices={is_loading_voices}
            mic_devices={mic_devices}
            on_load_voices={load_voices}
            on_load_mics={load_mics}
            on_select_voice={select_voice}
            on_select_mic={select_mic}
            selected_mic_id={selected_mic_id}
            selected_voice_id={selected_voice_id}
            voice_error={voice_error}
            voice_options={voice_options}
            // Identity
            profiles={identity.profiles}
            recognized_profile_id={identity.recognized_profile_id}
            recognized_label={recognized_name}
            identity_pill_value={identity_label}
            identity_pill_tone={identity_tone}
            is_identity_camera_running={identity.is_camera_running}
            is_identity_models_loaded={identity.is_models_loaded}
            is_identity_busy={identity.is_profile_action_running}
            identity_error_message={identity_error_message}
            on_identity_refresh={() => void identity.refresh_profiles()}
            on_identity_delete_profile={(args) => void identity.delete_profile(args)}
            on_identity_create_profile={(args) => void identity.create_profile(args)}
            on_identity_update_profile={(args) => void identity.update_profile(args)}
            on_identity_capture_enrollment={identity.capture_profile_enrollment}
            on_identity_add_profile_enrollment={(args) => void identity.add_profile_enrollment(args)}
            on_identity_view_memory={identity.view_profile_memory}
            on_identity_view_generated_images={identity.view_profile_generated_images}
            on_identity_delete_memory_item={identity.delete_profile_memory_item}
            // Status
            state_label={state}
            state_tone={state === "speaking" ? "ok" : state === "thinking" ? "warn" : "neutral"}
            is_connected={is_connected}
          />
        </div>

        <MouthWaves state={state} tts_audio_element={tts_audio_element} />

        <div className="shrink-0">
          <MouthTranscriptBar transcript={transcript} />
        </div>

        {/* Hidden camera element for face recognition + camera tools */}
        <video
          ref={identity.video_ref}
          muted
          playsInline
          className="fixed left-0 top-0 h-1 w-1 opacity-0 pointer-events-none"
        />
      </main>
    </div>
  );
};

