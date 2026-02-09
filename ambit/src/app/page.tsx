"use client";

/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useRef, useState } from "react";
import { MouthTopBar } from "@/components/mouth/mouth_top_bar";
import { MouthTranscriptBar } from "@/components/mouth/mouth_transcript_bar";
import { Orb, type UiMood } from "@/components/ui/orb";
import { BarVisualizer } from "@/components/ui/bar_visualizer";
import { useRealtimeStt } from "@/hooks/use_realtime_stt";
import { useIdentityRuntime } from "@/lib/identity/use_identity_runtime";
import { capture_frame_data_url_async } from "@/lib/identity/camera_browser";
import { strip_elevenlabs_v3_audio_tags } from "@/lib/elevenlabs/elevenlabs_audio_tags";
import { strip_citations } from "@/lib/elevenlabs/strip_citations";
import { GeneratedImageOverlay } from "@/components/ui/generated_image_overlay";
import { ImageTaskToast } from "@/components/ui/image_task_toast";
import { MatrixRain } from "@/components/ui/matrix_rain";
import { useVoiceQuality } from "@/hooks/use_voice_quality";
import { useThinkingSound } from "@/hooks/use_thinking_sound";
import { use_timers } from "@/hooks/use_timers";
import { use_wake_word } from "@/hooks/use_wake_word";
import { use_wake_greeting } from "@/hooks/use_wake_greeting";
import { use_session_timeout } from "@/hooks/use_session_timeout";
import { WordHighlightedText } from "@/components/ui/word_highlighted_text";
import { TimerDisplay } from "@/components/ui/timer_display";

// ── Mood extraction from UI events ──
const extract_latest_mood = (ui_events: Array<{ type: string; [key: string]: unknown }>): UiMood | null => {
  for (let i = ui_events.length - 1; i >= 0; i--) {
    const event = ui_events[i];
    if (event.type === "mood_change" && typeof event.mood === "string") {
      return event.mood as UiMood;
    }
  }
  return null;
};

// ── Screen capture helper ──
let screen_stream: MediaStream | null = null;

const capture_screen_frame = async (): Promise<string | null> => {
  try {
    if (!screen_stream || !screen_stream.active) {
      screen_stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    }

    const track = screen_stream.getVideoTracks()[0];
    if (!track) return null;

    // Create a video element from the screen share stream and capture a frame
    const video = document.createElement("video");
    video.srcObject = screen_stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 150)); // Wait for a rendered frame

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth || 1920, 1920);
    canvas.height = Math.min(video.videoHeight || 1080, 1080);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    video.srcObject = null;
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch (error) {
    console.warn("[Screen] Capture failed:", error);
    return null;
  }
};

export default function Home() {
  const [active_profile_id, set_active_profile_id] = useState<string | null>(
    null
  );
  const [
    should_reset_after_identity_unload,
    set_should_reset_after_identity_unload,
  ] = useState(false);

  const identity_video_ref = useRef<HTMLVideoElement | null>(null);
  const { quality, set_quality } = useVoiceQuality();

  // Mood-reactive UI state — debounced so "neutral" fades out slowly
  const [ui_mood_raw, set_ui_mood_raw] = useState<UiMood>("neutral");
  const [ui_mood, set_ui_mood] = useState<UiMood>("neutral");
  const mood_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce: non-neutral moods apply immediately; neutral waits 4s so the chip/glow don't flicker
  useEffect(() => {
    if (mood_timeout_ref.current) clearTimeout(mood_timeout_ref.current);
    if (ui_mood_raw !== "neutral") {
      set_ui_mood(ui_mood_raw);
    } else {
      mood_timeout_ref.current = setTimeout(() => set_ui_mood("neutral"), 4000);
    }
    return () => { if (mood_timeout_ref.current) clearTimeout(mood_timeout_ref.current); };
  }, [ui_mood_raw]);

  // Emotion ref — updated by identity runtime, read by useRealtimeStt
  const detected_emotion_ref = useRef<string | null>(null);

  // Thinking sounds toggle
  const [thinking_sounds_enabled, set_thinking_sounds_enabled] = useState(
    () => {
      if (typeof window === "undefined") return true;
      const saved = localStorage.getItem("ambit_thinking_sounds_enabled");
      return saved === null ? true : saved === "true";
    }
  );

  const handle_thinking_sounds_change = useCallback((enabled: boolean) => {
    set_thinking_sounds_enabled(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "ambit_thinking_sounds_enabled",
        String(enabled)
      );
    }
  }, []);

  // Refs to break circular dependency between useRealtimeStt and session hooks
  const end_session_ref = useRef<(() => void) | null>(null);
  const activity_ref = useRef<(() => void) | null>(null);

  const handle_farewell = useCallback(() => {
    end_session_ref.current?.();
  }, []);

  const handle_activity = useCallback(() => {
    activity_ref.current?.();
  }, []);

  const {
    is_connected,
    is_loading_mics,
    is_loading_voices,
    is_responding,
    is_generating_tts,
    is_speaking,
    is_tts_playing,
    load_mics,
    load_voices,
    mic_devices,
    cancel_inflight,
    reset_conversation,
    transcript,
    response_text,
    used_web_search,
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
    word_alignment,
    tts_text,
  } = useRealtimeStt({
    profile_id: active_profile_id,
    quality_mode: quality,
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
    capture_screen_frame,
    detected_emotion: detected_emotion_ref.current,
    on_farewell: handle_farewell,
    on_activity: handle_activity,
  });

  /* ---- Wake word + greeting + session timeout ---- */

  const end_session = useCallback(() => {
    is_waking_ref.current = false; // Allow wake word to trigger again
    stop_realtime();
    // Wake word will auto-resume via the `enabled` prop below
  }, [stop_realtime]);

  // Keep ref in sync so the farewell callback can reach end_session
  useEffect(() => {
    end_session_ref.current = end_session;
  }, [end_session]);

  // Pre-generate the "Hey, what's up!" greeting using the selected voice.
  // Cached and played instantly on wake word detection.
  const { play_greeting } = use_wake_greeting({
    voice_id: selected_voice_id,
    quality_mode: "fast",
  });

  // Refs so the on_wake callback always has the latest functions
  const play_greeting_ref = useRef(play_greeting);
  const start_realtime_ref = useRef(start_realtime);
  useEffect(() => { play_greeting_ref.current = play_greeting; }, [play_greeting]);
  useEffect(() => { start_realtime_ref.current = start_realtime; }, [start_realtime]);

  // Guard ref: prevents wake word from re-triggering during the async
  // start_realtime() window (is_connected hasn't become true yet).
  const is_waking_ref = useRef(false);

  // Reset the guard when the session connects or ends
  useEffect(() => {
    if (is_connected) is_waking_ref.current = false;
  }, [is_connected]);

  // Wake word: enabled when NOT in an active conversation and not mid-startup
  const wake_word_enabled = !is_connected;

  const handle_wake = useCallback((post_wake_audio: Float32Array) => {
    // Prevent re-entry during async start_realtime() (is_connected is still false)
    if (is_waking_ref.current) return;
    is_waking_ref.current = true;

    // 1. Play cached greeting instantly ("Hey, what's up!")
    play_greeting_ref.current();
    // 2. Start realtime connection with pre-buffered audio so the user's
    //    query ("whats the weather today") is not lost
    start_realtime_ref.current({
      pre_buffer: post_wake_audio,
      pre_buffer_sample_rate: 16_000,
    });
  }, []);

  const {
    is_listening: is_wake_listening,
  } = use_wake_word({
    on_wake: handle_wake,
    enabled: wake_word_enabled,
  });

  // Session timeout: auto-end after silence AFTER Ambit finishes speaking.
  // Include is_speaking so the timer never counts down while the user is
  // actively talking — prevents the session from ending mid-reply.
  const { reset_activity } = use_session_timeout({
    is_active: is_connected,
    is_busy: is_responding || is_generating_tts || is_tts_playing || is_speaking,
    on_timeout: end_session,
  });

  // Wire activity_ref so useRealtimeStt's on_activity resets the timeout
  useEffect(() => {
    activity_ref.current = reset_activity;
  }, [reset_activity]);

  // Cancel in-flight on profile switch
  const last_profile_id_ref = useRef<string | null>(active_profile_id);
  useEffect(() => {
    const prev = last_profile_id_ref.current;
    const next = active_profile_id;
    if (prev === next) return;
    cancel_inflight();
    last_profile_id_ref.current = next;
  }, [active_profile_id, cancel_inflight]);

  const handle_identity_expired = useCallback(() => {
    reset_conversation();
    set_should_reset_after_identity_unload(true);
    set_active_profile_id(null);
  }, [reset_conversation]);

  useEffect(() => {
    if (!should_reset_after_identity_unload) return;
    if (active_profile_id !== null) return;
    reset_conversation();
    set_should_reset_after_identity_unload(false);
  }, [
    active_profile_id,
    reset_conversation,
    should_reset_after_identity_unload,
  ]);

  const identity = useIdentityRuntime({
    active_profile_id,
    on_change_active_profile_id: set_active_profile_id,
    on_identity_expired: handle_identity_expired,
    video_ref: identity_video_ref,
  });

  useEffect(() => {
    const recognized = identity.recognized_profile_id;
    if (!recognized) return;
    if (active_profile_id === recognized) return;
    set_active_profile_id(recognized);
  }, [active_profile_id, identity.recognized_profile_id]);

  // Keep emotion ref in sync for useRealtimeStt
  useEffect(() => {
    detected_emotion_ref.current = identity.detected_emotion?.dominant ?? null;
  }, [identity.detected_emotion]);

  const recognized_label = (() => {
    const id = identity.recognized_profile_id;
    if (!id) return "Unknown";
    const match = identity.profiles.find((p) => p.profile_id === id);
    return match ? match.name : id;
  })();

  const { identity_label, identity_tone } = (() => {
    if (identity.models_error)
      return {
        identity_label: identity.models_error,
        identity_tone: "bad" as const,
      };
    if (identity.connection_error)
      return { identity_label: "Svc off", identity_tone: "warn" as const };
    if (!identity.is_models_loaded)
      return { identity_label: "Loading", identity_tone: "warn" as const };
    if (!identity.is_camera_running)
      return { identity_label: "Off", identity_tone: "warn" as const };
    if (identity.recognized_profile_id)
      return {
        identity_label: recognized_label,
        identity_tone: "ok" as const,
      };
    if (identity.is_detected)
      return { identity_label: "Unknown", identity_tone: "warn" as const };
    return { identity_label: "No face", identity_tone: "warn" as const };
  })();

  const identity_error_message =
    identity.profile_action_error ??
    identity.connection_error ??
    identity.models_error;

  const state = is_responding
    ? "thinking"
    : is_tts_playing
      ? "speaking"
      : is_connected || is_speaking
        ? "listening"
        : "initializing";

  useThinkingSound(
    is_responding || is_generating_tts,
    thinking_sounds_enabled
  );

  // Timer state from ui_events
  const {
    timers,
    active_timer_index,
    cycle_active_timer,
    dismiss_timer,
    has_timers,
  } = use_timers({ ui_events });

  // Track mood changes from UI events
  useEffect(() => {
    const mood = extract_latest_mood(ui_events);
    if (mood) set_ui_mood_raw(mood);
  }, [ui_events]);

  const display_text =
    tts_text ||
    (used_web_search
      ? strip_citations(strip_elevenlabs_v3_audio_tags(response_text))
      : strip_elevenlabs_v3_audio_tags(response_text));

  // ─── Derived visual state ───

  const ambient_class =
    state === "listening"
      ? "ambient-listening"
      : state === "thinking"
        ? "ambient-thinking"
        : state === "speaking"
          ? "ambient-speaking"
          : "ambient-idle";

  const bar_class =
    state === "speaking"
      ? "bar-speaking"
      : state === "thinking"
        ? "bar-thinking"
        : state === "listening"
          ? "bar-listening"
          : "bar-idle";

  // ─── Render ───

  return (
    <div className="relative h-screen w-screen overflow-hidden text-zinc-100" data-mood={ui_mood}>
      {/* Ambient background layer */}
      <div className={`ambient-bg ${ambient_class}`} />

      {/* Mood glow overlay — always rendered, opacity driven by mood */}
      <div
        className="mood-glow pointer-events-none fixed inset-0 z-[1]"
        style={{ opacity: ui_mood !== "neutral" ? 1 : 0, transition: "opacity 1.5s ease" }}
      />

      {/* Matrix rain background */}
      <MatrixRain opacity={0.09} mood={ui_mood} />

      {/* Overlays (z-50) */}
      <GeneratedImageOverlay ui_events={ui_events} />
      <ImageTaskToast ui_events={ui_events} />

      {/* ─── Floating top bar ─── */}
      <div className="fixed inset-x-0 top-0 z-30 px-3 pt-2.5 sm:px-5 sm:pt-3">
        <MouthTopBar
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
          voice_quality={quality}
          on_voice_quality_change={set_quality}
          thinking_sounds_enabled={thinking_sounds_enabled}
          on_thinking_sounds_change={handle_thinking_sounds_change}
          profiles={identity.profiles}
          recognized_profile_id={identity.recognized_profile_id}
          recognized_label={recognized_label}
          identity_pill_value={identity_label}
          identity_pill_tone={identity_tone}
          is_identity_camera_running={identity.is_camera_running}
          is_identity_models_loaded={identity.is_models_loaded}
          is_identity_busy={identity.is_profile_action_running}
          identity_error_message={identity_error_message}
          on_identity_refresh={() =>
            void identity.refresh_profiles()
          }
          on_identity_delete_profile={(args) =>
            void identity.delete_profile(args)
          }
          on_identity_create_profile={(args) =>
            void identity.create_profile(args)
          }
          on_identity_update_profile={(args) =>
            void identity.update_profile(args)
          }
          on_identity_capture_enrollment={
            identity.capture_profile_enrollment
          }
          on_identity_add_profile_enrollment={(args) =>
            void identity.add_profile_enrollment(args)
          }
          on_identity_view_memory={identity.view_profile_memory}
          on_identity_view_generated_images={
            identity.view_profile_generated_images
          }
          on_identity_delete_memory_item={
            identity.delete_profile_memory_item
          }
          on_identity_clear_all_memory={
            identity.clear_all_memory
          }
          on_identity_analyze_memory={
            identity.analyze_memory
          }
          state_label={state}
          state_tone={
            state === "speaking"
              ? "ok"
              : state === "thinking"
                ? "warn"
                : "neutral"
          }
          is_connected={is_connected}
          detected_emotion={identity.detected_emotion?.dominant ?? null}
          ui_mood={ui_mood}
        />
      </div>

      {/* ─── Center stage: Orb + Bars ─── */}
      <main className="relative z-10 flex h-full flex-col items-center">
        {/* Top safe zone — clears the fixed top bar */}
        <div className="shrink-0 h-14 sm:h-16" />

        {/* Vertically-centered orb + bar visualizer + response */}
        <div className="flex flex-1 flex-col items-center justify-center min-h-0 w-full">
          {/* Shared-width column so orb, bars, and response all align */}
          <div className="flex flex-col items-center w-[min(560px,90vw)] animate-fade-in-scale">
            {/* Orb + start label (whole area is clickable when disconnected) */}
            {!is_connected ? (
              <button
                type="button"
                className="flex cursor-pointer flex-col items-center gap-5 bg-transparent outline-none"
                onClick={() => start_realtime()}
                aria-label="Start listening"
              >
                <Orb state={state} mood={ui_mood}>
                  {has_timers && (
                    <TimerDisplay
                      timers={timers}
                      active_index={active_timer_index}
                      on_cycle={cycle_active_timer}
                      on_dismiss={dismiss_timer}
                    />
                  )}
                </Orb>
                <span className="text-base font-bold tracking-wide text-amber-200/90 transition-colors hover:text-amber-100 animate-fade-in-up delay-300">
                  {is_wake_listening
                    ? "Say \u2018Hey Ambit\u2019 or tap to start"
                    : "Tap to start"}
                </span>
              </button>
            ) : (
              <Orb
                state={state}
                mood={ui_mood}
                onClick={stop_realtime}
              >
                {has_timers && (
                  <TimerDisplay
                    timers={timers}
                    active_index={active_timer_index}
                    on_cycle={cycle_active_timer}
                    on_dismiss={dismiss_timer}
                  />
                )}
              </Orb>
            )}

            {/* Bar visualizer directly below orb — same width as container */}
            <div className="mt-6 w-full sm:mt-8">
              <div className="waveform-box rounded-2xl px-3 py-3 sm:px-4 sm:py-3">
                <BarVisualizer
                  state={state}
                  audioElement={tts_audio_element}
                  barCount={42}
                  minHeight={18}
                  maxHeight={100}
                  centerAlign={false}
                  className="h-[clamp(80px,15vh,140px)]"
                  barClassName={bar_class}
                />
              </div>
            </div>

            {/* ─── Response panel (subtitle area) — same width as container ─── */}
            {(response_text || is_responding) && (
              <div
                className="response-panel mt-5 w-full rounded-lg px-6 py-4 animate-fade-in-up max-h-[min(28vh,200px)] overflow-y-auto"
                aria-live="polite"
              >
                {is_responding ? (
                  <div className="flex items-center justify-center gap-1.5 py-2">
                    <span className="thinking-dot inline-block h-2.5 w-2.5 rounded-sm bg-purple-400" />
                    <span className="thinking-dot inline-block h-2.5 w-2.5 rounded-sm bg-purple-400" />
                    <span className="thinking-dot inline-block h-2.5 w-2.5 rounded-sm bg-purple-400" />
                  </div>
                ) : (
                  <WordHighlightedText
                    text={display_text.trim() || "\u2026"}
                    word_alignment={word_alignment}
                    audio_element={tts_audio_element}
                    className="text-center font-semibold text-white leading-relaxed whitespace-pre-wrap"
                    style={{ fontSize: "var(--text-response)" }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom safe zone — clears the fixed transcript bar */}
        <div className="shrink-0 h-14 sm:h-16" />
      </main>

      {/* ─── Floating transcript at bottom ─── */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 sm:pb-5">
        <MouthTranscriptBar transcript={transcript} />
      </div>

      {/* Hidden camera for face recognition */}
      <video
        ref={identity.video_ref}
        muted
        playsInline
        className="pointer-events-none fixed left-0 top-0 h-1 w-1 opacity-0"
      />
    </div>
  );
}
