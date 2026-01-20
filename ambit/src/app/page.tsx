"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MouthTopBar } from "@/components/mouth/mouth_top_bar";
import { MouthTranscriptBar } from "@/components/mouth/mouth_transcript_bar";
import { MouthWaves } from "@/components/mouth/mouth_waves";
import { useRealtimeStt } from "@/hooks/use_realtime_stt";
import { useIdentityRuntime } from "@/lib/identity/use_identity_runtime";
import { capture_frame_data_url_async } from "@/lib/identity/camera_browser";
import { strip_elevenlabs_v3_audio_tags } from "@/lib/elevenlabs/elevenlabs_audio_tags";
import { useIsFullscreen } from "@/lib/ui/use_is_fullscreen";
import { GeneratedImageOverlay } from "@/components/ui/generated_image_overlay";
import { ImageTaskToast } from "@/components/ui/image_task_toast";

export default function Home() {
  // Start in base knowledge (anonymous) on every launch.
  const [active_profile_id, set_active_profile_id] = useState<string | null>(null);
  const [should_reset_after_identity_unload, set_should_reset_after_identity_unload] =
    useState(false);

  const identity_video_ref = useRef<HTMLVideoElement | null>(null);

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
    cancel_inflight,
    reset_conversation,
    transcript,
    response_text,
    ui_events,
    select_voice,
    select_mic,
    selected_mic_id,
    selected_voice_id,
    start_realtime,
    stop_realtime,
    tts_audio_element,
    voice_error,
    voice_options,
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

  // When identity switches profiles, cancel in-flight audio/response so we don't
  // carry output across profiles.
  const last_profile_id_ref = useRef<string | null>(active_profile_id);
  useEffect(() => {
    const prev = last_profile_id_ref.current;
    const next = active_profile_id;
    if (prev === next) return;
    cancel_inflight();
    last_profile_id_ref.current = next;
  }, [active_profile_id, cancel_inflight]);

  const handle_identity_expired = useCallback(() => {
    console.log("[Page] Identity expired, switching to anonymous mode");
    // 1) Clear the active profile's conversation state
    reset_conversation();
    // 2) Switch to anonymous mode
    set_should_reset_after_identity_unload(true);
    set_active_profile_id(null);
  }, [reset_conversation]);

  useEffect(() => {
    if (!should_reset_after_identity_unload) return;
    if (active_profile_id !== null) return;
    console.log("[Page] Resetting conversation after identity unload");
    reset_conversation();
    set_should_reset_after_identity_unload(false);
  }, [active_profile_id, reset_conversation, should_reset_after_identity_unload]);

  // Log when active profile changes
  useEffect(() => {
    console.log(`[Page] Active profile changed to: ${active_profile_id ? active_profile_id : "Anonymous"}`);
  }, [active_profile_id]);

  // Auto-start on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!is_connected) {
        start_realtime();
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const is_fullscreen = useIsFullscreen();

  const identity = useIdentityRuntime({
    active_profile_id,
    on_change_active_profile_id: set_active_profile_id,
    on_identity_expired: handle_identity_expired,
    video_ref: identity_video_ref,
  });

  // Safety net: if the identity system confirms a profile, ensure the active
  // conversation context follows it.
  useEffect(() => {
    const recognized = identity.recognized_profile_id;
    if (!recognized) return;
    if (active_profile_id === recognized) return;
    console.log(`[Page Safety Net] Syncing active_profile_id: ${active_profile_id} → ${recognized}`);
    set_active_profile_id(recognized);
  }, [active_profile_id, identity.recognized_profile_id]);

  const recognized_label = (() => {
    const id = identity.recognized_profile_id;
    if (!id) return "Unknown";
    const match = identity.profiles.find((p) => p.profile_id === id);
    return match ? match.name : id;
  })();

  const { identity_label, identity_tone } = (() => {
    if (identity.models_error)
      return { identity_label: identity.models_error, identity_tone: "bad" as const };
    if (identity.connection_error)
      return { identity_label: "Svc off", identity_tone: "warn" as const };
    if (!identity.is_models_loaded) return { identity_label: "Loading", identity_tone: "warn" as const };
    if (!identity.is_camera_running) return { identity_label: "Off", identity_tone: "warn" as const };
    if (identity.recognized_profile_id)
      return { identity_label: recognized_label, identity_tone: "ok" as const };
    if (identity.is_detected) return { identity_label: "Unknown", identity_tone: "warn" as const };
    return { identity_label: "No face", identity_tone: "warn" as const };
  })();

  const identity_error_message =
    identity.profile_action_error ?? identity.connection_error ?? identity.models_error;

  const state =
    is_responding
      ? "thinking"
      : is_tts_playing
        ? "speaking"
        : is_connected || is_speaking
          ? "listening"
          : "initializing";

  const display_response_text = strip_elevenlabs_v3_audio_tags(response_text);

  return (
    <div
      className={`${is_fullscreen ? "h-[100dvh] w-[100dvw] overflow-hidden" : "min-h-screen"} bg-zinc-950 text-zinc-100`}
    >
      <GeneratedImageOverlay ui_events={ui_events} />
      <ImageTaskToast ui_events={ui_events} />

      {is_fullscreen ? (
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
              recognized_label={recognized_label}
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
        </main>
      ) : (
        <main className="mx-auto w-full max-w-[980px] px-[clamp(10px,2.6vw,18px)] py-[clamp(14px,3vw,28px)]">
          <div className="relative overflow-hidden rounded-[clamp(22px,4vw,32px)] border border-zinc-800/80 bg-black/35 p-[clamp(10px,2.6vw,18px)] shadow-2xl ring-1 ring-white/5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.08),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(168,85,247,0.10),transparent_55%)]" />
            <div className="relative flex flex-col gap-[clamp(10px,2.2vw,16px)]">
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
                  recognized_label={recognized_label}
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
                  state_tone={
                    state === "speaking" ? "ok" : state === "thinking" ? "warn" : "neutral"
                  }
                  is_connected={is_connected}
                />
              </div>

              <div className="flex h-[clamp(320px,52vh,560px)] flex-col">
                <MouthWaves state={state} tts_audio_element={tts_audio_element} />
              </div>

              <div className="shrink-0">
                <MouthTranscriptBar transcript={transcript} />
              </div>

              {response_text || is_responding ? (
                <div className="shrink-0 rounded-[clamp(18px,4vw,28px)] border border-zinc-800 bg-black/45 px-[clamp(12px,2.6vw,18px)] py-[clamp(10px,2.2vw,14px)]">
                  <p className="text-[clamp(10px,1.3vw,12px)] uppercase tracking-[0.22em] text-zinc-500">
                    Response
                  </p>
                  <p className="mt-2 text-[clamp(14px,2.2vw,20px)] font-medium text-zinc-100 leading-snug whitespace-pre-wrap">
                    {display_response_text.trim() || (is_responding ? "Thinking…" : "…")}
                  </p>
                </div>
              ) : null}

              <div className="shrink-0 pt-1">
                <div className="flex items-center justify-center gap-3">
                  {!is_connected ? (
                    <button
                      className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-6 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={start_realtime}
                      disabled={is_speaking}
                      type="button"
                    >
                      Start
                    </button>
                  ) : (
                    <button
                      className="rounded-full border border-zinc-700 bg-zinc-950/40 px-6 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={stop_realtime}
                      disabled={is_speaking}
                      type="button"
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Hidden camera element for background face recognition */}
      <video
        ref={identity.video_ref}
        muted
        playsInline
        className="fixed left-0 top-0 h-1 w-1 opacity-0 pointer-events-none"
      />
    </div>
  );
}
