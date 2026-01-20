"use client";

import { useCallback, useEffect, useState } from "react";
import { SttVisualizer } from "@/components/stt/stt_visualizer";
import { IdentityPanel } from "@/components/identity/identity_panel";
import { SettingsPanel } from "@/components/ui/settings_panel";
import { useRealtimeStt } from "@/hooks/use_realtime_stt";

export default function Home() {
  // Start in base knowledge (anonymous) on every launch.
  const [active_profile_id, set_active_profile_id] = useState<string | null>(null);
  const [should_reset_after_identity_unload, set_should_reset_after_identity_unload] =
    useState(false);

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
    reset_conversation,
    response_text,
    select_voice,
    select_mic,
    selected_mic_id,
    selected_voice_id,
    start_realtime,
    stop_realtime,
    tts_audio_element,
    voice_error,
    voice_options,
  } = useRealtimeStt({ profile_id: active_profile_id });

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
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
            />
          </div>

          {/* Response Display */}
          {response_text && (
            <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900/50 p-6 shadow-lg">
              <p className="text-lg text-zinc-100 leading-relaxed whitespace-pre-wrap">{response_text}</p>
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

        {/* Identity Panel */}
        <IdentityPanel
          active_profile_id={active_profile_id}
          on_change_active_profile_id={set_active_profile_id}
          on_identity_expired={handle_identity_expired}
        />
      </main>
    </div>
  );
}
