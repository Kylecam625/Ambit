import { useCallback, useEffect, useRef } from "react";
import { parse_elevenlabs_stream_with_timestamps_jsonl } from "@/lib/elevenlabs/elevenlabs_alignment_to_words";

/* ------------------------------------------------------------------ */
/*  Pre-generate and cache the "Hey, what's up!" wake greeting audio   */
/*                                                                     */
/*  On mount (and whenever the selected voice changes), this hook      */
/*  calls the ElevenLabs TTS endpoint to generate the greeting audio.  */
/*  The audio blob is cached so that play_greeting() is instant.       */
/* ------------------------------------------------------------------ */

const GREETING_TEXT = "Hey, what's up!";

export const use_wake_greeting = ({
  voice_id,
  quality_mode = "fast",
}: {
  voice_id: string | null;
  quality_mode?: "quality" | "fast";
}) => {
  const cached_url_ref = useRef<string | null>(null);
  const cached_voice_ref = useRef<string | null>(null);
  const audio_el_ref = useRef<HTMLAudioElement | null>(null);
  const generating_ref = useRef(false);
  const abort_ref = useRef<AbortController | null>(null);

  /* ---- Generate and cache the greeting ---- */
  const generate_greeting = useCallback(
    async (target_voice_id: string) => {
      // Don't re-generate if we already have it for this voice
      if (cached_voice_ref.current === target_voice_id && cached_url_ref.current) return;
      if (generating_ref.current) return;

      generating_ref.current = true;
      abort_ref.current?.abort();
      const controller = new AbortController();
      abort_ref.current = controller;

      try {
        const response = await fetch("/api/realtime/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: GREETING_TEXT,
            voice_id: target_voice_id,
            quality_mode, // Use fast for lower latency on greeting
            optimize_latency: 4, // Maximum latency optimization
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          console.warn("[WakeGreeting] Failed to generate greeting:", response.status);
          return;
        }

        const reader = response.body.getReader();
        const parsed = await parse_elevenlabs_stream_with_timestamps_jsonl({
          reader,
          should_abort: () => controller.signal.aborted,
        });

        if (!parsed || controller.signal.aborted) return;

        const { audio_bytes } = parsed;

        // Revoke previous cached URL
        if (cached_url_ref.current) {
          URL.revokeObjectURL(cached_url_ref.current);
        }

        const blob = new Blob([audio_bytes as BlobPart], { type: "audio/mpeg" });
        cached_url_ref.current = URL.createObjectURL(blob);
        cached_voice_ref.current = target_voice_id;
        console.log("[WakeGreeting] Greeting cached for voice:", target_voice_id);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("[WakeGreeting] Error generating greeting:", error);
      } finally {
        generating_ref.current = false;
      }
    },
    [quality_mode]
  );

  /* ---- Re-generate when voice changes ---- */
  useEffect(() => {
    if (!voice_id) return;
    void generate_greeting(voice_id);
  }, [voice_id, generate_greeting]);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      abort_ref.current?.abort();
      if (cached_url_ref.current) {
        URL.revokeObjectURL(cached_url_ref.current);
        cached_url_ref.current = null;
      }
    };
  }, []);

  /* ---- Play the cached greeting instantly ---- */
  const play_greeting = useCallback(() => {
    const url = cached_url_ref.current;
    if (!url) {
      console.log("[WakeGreeting] No cached greeting available, skipping");
      return;
    }

    // Reuse or create audio element
    const audio = audio_el_ref.current ?? new Audio();
    audio_el_ref.current = audio;

    audio.src = url;
    audio.play().catch((error) => {
      console.warn("[WakeGreeting] Failed to play greeting:", error);
    });
  }, []);

  /** Stop greeting playback (e.g. if user starts talking). */
  const stop_greeting = useCallback(() => {
    const audio = audio_el_ref.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  return {
    play_greeting,
    stop_greeting,
    /** Whether a greeting is cached and ready to play. */
    is_ready: cached_url_ref.current !== null,
  };
};
