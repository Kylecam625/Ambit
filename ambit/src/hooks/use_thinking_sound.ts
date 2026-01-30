import { useEffect, useRef } from "react";

const THINKING_SOUND = "/thinkingsounds/Untitled%20video%20-%20Made%20with%20Clipchamp.mp3";

export const useThinkingSound = (is_thinking: boolean, enabled: boolean = true) => {
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const direction_ref = useRef<"forward" | "backward">("forward");
  const animation_frame_ref = useRef<number | null>(null);
  const last_time_ref = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabled) return; // Skip if disabled

    const animate_playback = (current_time: number) => {
      const audio = audio_ref.current;
      if (!audio || audio.paused) return;

      const delta = (current_time - last_time_ref.current) / 1000;
      last_time_ref.current = current_time;

      if (direction_ref.current === "forward") {
        // Playing forward normally, check if we hit the end
        if (audio.currentTime >= audio.duration - 0.01) {
          direction_ref.current = "backward";
        }
      } else {
        // Playing backward, manually decrement time
        audio.currentTime = Math.max(0, audio.currentTime - delta);
        
        if (audio.currentTime <= 0.01) {
          direction_ref.current = "forward";
          audio.currentTime = 0;
        }
      }

      animation_frame_ref.current = requestAnimationFrame(animate_playback);
    };

    if (is_thinking) {
      // Create new audio element
      if (audio_ref.current) {
        audio_ref.current.pause();
        audio_ref.current = null;
      }

      const audio = new Audio(THINKING_SOUND);
      audio.volume = 0.4; // 40% volume
      audio_ref.current = audio;

      direction_ref.current = "forward";
      audio.currentTime = 0;
      last_time_ref.current = performance.now();
      
      audio.play().catch((error) => {
        console.warn("[ThinkingSound] Failed to play:", error);
      });

      animation_frame_ref.current = requestAnimationFrame(animate_playback);
    } else {
      // Stop thinking sound
      if (audio_ref.current) {
        audio_ref.current.pause();
        audio_ref.current.currentTime = 0;
        audio_ref.current = null;
      }
      
      if (animation_frame_ref.current !== null) {
        cancelAnimationFrame(animation_frame_ref.current);
        animation_frame_ref.current = null;
      }
    }

    return () => {
      if (animation_frame_ref.current !== null) {
        cancelAnimationFrame(animation_frame_ref.current);
      }
      if (audio_ref.current) {
        audio_ref.current.pause();
      }
    };
  }, [is_thinking, enabled]);
};
