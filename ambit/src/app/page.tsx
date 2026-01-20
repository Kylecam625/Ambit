"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MouthTopBar } from "@/components/mouth/mouth_top_bar";
import { MouthTranscriptBar } from "@/components/mouth/mouth_transcript_bar";
import { MouthWaves } from "@/components/mouth/mouth_waves";
import { SttVisualizer } from "@/components/stt/stt_visualizer";
import { FullscreenButton } from "@/components/ui/fullscreen_button";
import { SettingsPanel } from "@/components/ui/settings_panel";
import { useRealtimeStt } from "@/hooks/use_realtime_stt";
import { useIdentityRuntime } from "@/lib/identity/use_identity_runtime";
import { capture_frame_data_url } from "@/lib/identity/camera_browser";
import { useIsFullscreen } from "@/lib/ui/use_is_fullscreen";

export default function Home() {
  // Start in base knowledge (anonymous) on every launch.
  const [active_profile_id, set_active_profile_id] = useState<string | null>(null);
  const [should_reset_after_identity_unload, set_should_reset_after_identity_unload] =
    useState(false);

  const identity_video_ref = useRef<HTMLVideoElement | null>(null);
  const image_timer_ref = useRef<number | null>(null);
  const [ephemeral_image_data_url, set_ephemeral_image_data_url] = useState<string | null>(null);

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
    reset_transcript,
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
      return (
        capture_frame_data_url({
          video_el,
          max_size: 512,
          mime: "image/jpeg",
          quality: 0.85,
          mirror: true,
        }) ?? null
      );
    },
  });

  // When identity switches profiles, cancel in-flight audio/response so we don't
  // carry output across profiles.
  const last_profile_id_ref = useRef<string | null>(active_profile_id);
  useEffect(() => {
    const prev = last_profile_id_ref.current;
    const next = active_profile_id;
    if (prev === next) return;
    reset_transcript();
    last_profile_id_ref.current = next;
  }, [active_profile_id, reset_transcript]);

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

  const is_active = is_connected || is_speaking || is_responding;

  useEffect(() => {
    const event = ui_events.find((e) => e.type === "display_image") ?? null;
    const image_data_url =
      event && typeof event["image_data_url"] === "string" ? String(event["image_data_url"]) : "";
    if (!image_data_url) return;

    const display_ms_raw = event ? event["display_ms"] : null;
    const display_ms =
      typeof display_ms_raw === "number" && Number.isFinite(display_ms_raw)
        ? Math.max(0, Math.floor(display_ms_raw))
        : 5000;

    if (image_timer_ref.current) {
      window.clearTimeout(image_timer_ref.current);
      image_timer_ref.current = null;
    }

    set_ephemeral_image_data_url(image_data_url);
    image_timer_ref.current = window.setTimeout(() => {
      set_ephemeral_image_data_url(null);
      image_timer_ref.current = null;
    }, display_ms);

    return () => {
      if (image_timer_ref.current) {
        window.clearTimeout(image_timer_ref.current);
        image_timer_ref.current = null;
      }
    };
  }, [ui_events]);

  useEffect(() => {
    if (!is_speaking) return;
    set_ephemeral_image_data_url(null);
  }, [is_speaking]);

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
    set_active_profile_id(recognized);
  }, [active_profile_id, identity.recognized_profile_id]);

  const recognized_label = (() => {
    const id = identity.recognized_profile_id;
    if (!id) return "Unknown";
    const match = identity.profiles.find((p) => p.profile_id === id);
    return match ? match.name : id;
  })();

  const { identity_label, identity_kind } = (() => {
    if (identity.models_error) {
      return { identity_label: "Error", identity_kind: "bad" as const };
    }
    if (!identity.is_models_loaded) {
      return { identity_label: "Loading", identity_kind: "warn" as const };
    }
    if (!identity.is_camera_running) {
      return { identity_label: "Off", identity_kind: "warn" as const };
    }
    if (identity.recognized_profile_id) {
      return { identity_label: recognized_label, identity_kind: "ok" as const };
    }
    if (identity.is_detected) {
      return { identity_label: "Unknown", identity_kind: "warn" as const };
    }
    return { identity_label: "No face", identity_kind: "warn" as const };
  })();

  const state =
    is_responding
      ? "thinking"
      : is_tts_playing
        ? "speaking"
        : is_connected || is_speaking
          ? "listening"
          : "initializing";

  return (
    <div
      className={`${is_fullscreen ? "h-[100dvh] w-[100dvw] overflow-hidden" : "min-h-screen"} bg-zinc-950 text-zinc-100`}
    >
      {/* Ephemeral generated image display */}
      {ephemeral_image_data_url ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <button
            className="absolute inset-0 cursor-default"
            type="button"
            aria-label="Close image"
            onClick={() => set_ephemeral_image_data_url(null)}
          />
          <div className="relative w-full max-w-2xl">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ephemeral_image_data_url}
                alt="Generated"
                className="h-auto w-full rounded-xl object-contain"
              />
              <p className="mt-2 text-center text-xs text-zinc-400">
                Saved to profile (if recognized)
              </p>
            </div>
          </div>
        </div>
      ) : null}

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
              is_identity_camera_running={identity.is_camera_running}
              is_identity_models_loaded={identity.is_models_loaded}
              is_identity_busy={identity.is_profile_action_running}
              identity_error_message={identity.profile_action_error}
              on_identity_refresh={() => void identity.refresh_profiles()}
              on_identity_delete_profile={(args) => void identity.delete_profile(args)}
              on_identity_create_profile={(args) => void identity.create_profile(args)}
              on_identity_capture_enrollment={identity.capture_profile_enrollment}
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

          {/* Hidden camera element for background face recognition */}
          <video
            ref={identity.video_ref}
            muted
            playsInline
            className="fixed left-0 top-0 h-1 w-1 opacity-0 pointer-events-none"
          />
        </main>
      ) : (
        <>
          {/* Fullscreen button in top left */}
          <div className="fixed left-6 top-6 z-50">
            <FullscreenButton />
          </div>

          {/* Settings button in top right */}
          <div className="fixed right-6 top-6 z-50">
            <SettingsPanel
              is_loading_mics={is_loading_mics}
              is_loading_voices={is_loading_voices}
              is_disabled={false}
              mic_devices={mic_devices}
              on_load_voices={load_voices}
              on_load_mics={load_mics}
              on_select_voice={select_voice}
              on_select_mic={select_mic}
              selected_mic_id={selected_mic_id}
              selected_voice_id={selected_voice_id}
              voice_error={voice_error}
              voice_options={voice_options}
              profiles={identity.profiles}
              recognized_profile_id={identity.recognized_profile_id}
              recognized_label={recognized_label}
              is_identity_camera_running={identity.is_camera_running}
              is_identity_models_loaded={identity.is_models_loaded}
              is_identity_busy={identity.is_profile_action_running}
              identity_error_message={identity.profile_action_error}
              on_identity_refresh={() => void identity.refresh_profiles()}
              on_identity_delete_profile={(args) => void identity.delete_profile(args)}
              on_identity_create_profile={(args) => void identity.create_profile(args)}
              on_identity_capture_enrollment={identity.capture_profile_enrollment}
              on_identity_view_memory={identity.view_profile_memory}
              on_identity_view_generated_images={identity.view_profile_generated_images}
              on_identity_delete_memory_item={identity.delete_profile_memory_item}
            />
          </div>

          <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
            {/* Main Ambit Visualizer - Large and Centered */}
            <section className="flex flex-col items-center gap-8 pt-12">
              <div className="flex flex-col items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight">Ambit</h1>
                <p className="text-sm text-zinc-400">
                  {is_active ? "Listening..." : "Ready to listen"}
                </p>
              </div>

              {/* Large visualizer */}
              <div className="w-full max-w-2xl">
                <SttVisualizer
                  is_connected={is_connected}
                  is_responding={is_responding}
                  is_speaking={is_speaking}
                  is_tts_playing={is_tts_playing}
                  tts_audio_element={tts_audio_element}
                  identity_label={identity_label}
                  identity_kind={identity_kind}
                />
              </div>

              {/* Hidden camera element for background face recognition */}
              <video
                ref={identity.video_ref}
                muted
                playsInline
                className="fixed left-0 top-0 h-1 w-1 opacity-0 pointer-events-none"
              />

              {/* Response Display */}
              {response_text && (
                <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900/50 p-6 shadow-lg">
                  <p className="text-lg text-zinc-100 leading-relaxed whitespace-pre-wrap">
                    {response_text}
                  </p>
                </div>
              )}

              {/* Show loading state when responding */}
              {is_responding && !response_text && (
                <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900/50 p-6">
                  <p className="text-base text-zinc-400 italic">Thinking...</p>
                </div>
              )}

              {/* Simple toggle control */}
              <div className="flex items-center gap-4">
                {!is_connected ? (
                  <button
                    className="rounded-full bg-blue-500 px-8 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                    onClick={start_realtime}
                    disabled={is_speaking}
                    type="button"
                  >
                    Start Conversation
                  </button>
                ) : (
                  <button
                    className="rounded-full border border-zinc-700 px-8 py-3 text-base font-semibold text-zinc-100 hover:border-zinc-600 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
                    onClick={stop_realtime}
                    disabled={is_speaking}
                    type="button"
                  >
                    Stop
                  </button>
                )}
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}
