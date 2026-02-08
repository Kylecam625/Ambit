import { useEffect, useRef } from "react";

const THINKING_SOUND_URL =
  "/thinkingsounds/Untitled%20video%20-%20Made%20with%20Clipchamp.mp3";

const TARGET_VOLUME = 0.4;
const FADE_MS = 600;

/**
 * Plays a looping "thinking" sound while `is_thinking` is true.
 *
 * Key design choices:
 * - Reuses a single HTMLAudioElement across play/stop cycles (no orphaned elements).
 * - Uses `audio.loop = true` for reliable looping instead of manual forward/backward hacks.
 * - Fades volume in/out so starts and stops aren't jarring.
 * - `want_playing_ref` resolves the race between async `play()` and the React effect lifecycle.
 */
export const useThinkingSound = (
  is_thinking: boolean,
  enabled: boolean = true,
) => {
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const fade_ref = useRef<number | null>(null);
  const want_playing_ref = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const should_play = is_thinking && enabled;
    want_playing_ref.current = should_play;

    // ── helpers ──

    const cancel_fade = () => {
      if (fade_ref.current !== null) {
        cancelAnimationFrame(fade_ref.current);
        fade_ref.current = null;
      }
    };

    const fade = (
      audio: HTMLAudioElement,
      to: number,
      done?: () => void,
    ) => {
      cancel_fade();
      const from = audio.volume;
      if (Math.abs(from - to) < 0.01) {
        audio.volume = to;
        done?.();
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / FADE_MS, 1);
        audio.volume = Math.min(1, Math.max(0, from + (to - from) * p));
        if (p < 1) {
          fade_ref.current = requestAnimationFrame(tick);
        } else {
          fade_ref.current = null;
          done?.();
        }
      };
      fade_ref.current = requestAnimationFrame(tick);
    };

    // ── start / stop ──

    if (should_play) {
      // Lazily create and reuse one audio element
      let audio = audio_ref.current;
      if (!audio) {
        audio = new Audio(THINKING_SOUND_URL);
        audio.loop = true;
        audio.preload = "auto";
        audio_ref.current = audio;
      }

      cancel_fade();
      audio.currentTime = 0;
      audio.volume = 0;

      const play_promise = audio.play();
      if (play_promise) {
        play_promise
          .then(() => {
            // Guard: only fade in if we still want to be playing.
            // Covers the case where is_thinking toggled off before the
            // browser resolved the play() promise.
            if (want_playing_ref.current) {
              fade(audio!, TARGET_VOLUME);
            } else {
              audio!.pause();
              audio!.currentTime = 0;
            }
          })
          .catch((e) => {
            // AbortError is expected when pause() beats play() — ignore it.
            if (e.name !== "AbortError") {
              console.warn("[ThinkingSound] Playback failed:", e);
            }
          });
      }
    } else if (audio_ref.current) {
      const audio = audio_ref.current;
      if (!audio.paused) {
        fade(audio, 0, () => {
          audio.pause();
          audio.currentTime = 0;
        });
      }
    }

    // Effect cleanup: only cancel the in-progress fade animation.
    // Don't pause the audio here — let the *next* effect handle the
    // transition so fade-out actually gets a chance to run.
    return cancel_fade;
  }, [is_thinking, enabled]);

  // Full teardown on component unmount
  useEffect(
    () => () => {
      if (fade_ref.current !== null) cancelAnimationFrame(fade_ref.current);
      if (audio_ref.current) {
        audio_ref.current.pause();
        audio_ref.current.src = "";
        audio_ref.current = null;
      }
    },
    [],
  );
};
