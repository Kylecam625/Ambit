"use client";

import { useEffect, useRef, useState } from "react";

export type AgentState =
  | "connecting"
  | "initializing"
  | "listening"
  | "speaking"
  | "thinking";

type BarVisualizerProps = {
  state: AgentState;
  barCount?: number;
  audioElement?: HTMLAudioElement | null;
  minHeight?: number;
  maxHeight?: number;
  centerAlign?: boolean;
  className?: string;
  barClassName?: string;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// Global singleton for audio analysis - persists across hot reloads
class AudioAnalyzer {
  private static instance: AudioAnalyzer;
  private connections = new Map<HTMLAudioElement, {
    context: AudioContext;
    source: MediaElementAudioSourceNode;
    analyser: AnalyserNode;
  }>();

  static getInstance(): AudioAnalyzer {
    if (!AudioAnalyzer.instance) {
      AudioAnalyzer.instance = new AudioAnalyzer();
    }
    return AudioAnalyzer.instance;
  }

  getAnalyser(element: HTMLAudioElement): AnalyserNode | null {
    let connection = this.connections.get(element);

    if (!connection) {
      try {
        const context = new AudioContext();
        const source = context.createMediaElementSource(element);
        const analyser = context.createAnalyser();
        
        analyser.fftSize = 2048; // Reduced from 4096 for better performance
        analyser.smoothingTimeConstant = 0.6;
        analyser.minDecibels = -70;
        analyser.maxDecibels = -0;

        source.connect(analyser);
        source.connect(context.destination); // Hear the audio

        connection = { context, source, analyser };
        this.connections.set(element, connection);

        // Resume context when audio starts playing
        const resumeContext = () => {
          if (context.state === 'suspended') {
            void context.resume();
          }
        };

        element.addEventListener('play', resumeContext);
        element.addEventListener('playing', resumeContext);

        // Note: We DON'T disconnect when audio ends because the same
        // element is reused for multiple TTS responses

      } catch (error) {
        console.error("Failed to create audio analyser:", error);
        return null; // Already connected elsewhere
      }
    }

    // Always try to resume context - critical for audio playback
    if (connection.context.state !== 'running') {
      connection.context.resume().then(() => {
        console.log("Audio context resumed successfully");
      }).catch(err => {
        console.error("Failed to resume audio context:", err);
      });
    }

    return connection.analyser;
  }

  disconnect(element: HTMLAudioElement): void {
    const connection = this.connections.get(element);
    if (connection) {
      try {
        connection.source.disconnect();
        connection.analyser.disconnect();
        void connection.context.close();
      } catch {}
      this.connections.delete(element);
    }
  }
}

const useAudioFrequencies = (
  audio_element: HTMLAudioElement | null,
  enabled: boolean,
  bar_count: number
): number[] => {
  const [frequencies, set_frequencies] = useState<number[]>(() =>
    Array(bar_count).fill(0)
  );
  const previous_ref = useRef<number[]>(Array(bar_count).fill(0));

  useEffect(() => {
    if (!enabled || !audio_element) {
      const animation_frame = requestAnimationFrame(() => {
        set_frequencies(Array(bar_count).fill(0));
      });

      return () => cancelAnimationFrame(animation_frame);
    }

    const analyzer = AudioAnalyzer.getInstance();
    const analyser = analyzer.getAnalyser(audio_element);

    if (!analyser) {
      const animation_frame = requestAnimationFrame(() => {
        set_frequencies(Array(bar_count).fill(0));
      });

      return () => cancelAnimationFrame(animation_frame);
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let animation_frame: number;

    const update = () => {
      analyser.getByteFrequencyData(data);

      // Simplified frequency mapping for better performance
      const values = Array.from({ length: bar_count }, (_, i) => {
        const log_pos = Math.pow(i / bar_count, 2.0);
        const freq_index = Math.floor(log_pos * data.length * 0.35);
        const band_width = Math.max(3, Math.floor(data.length * 0.02));
        
        const end = Math.min(freq_index + band_width, data.length);
        let sum = 0;
        for (let j = freq_index; j < end; j++) {
          sum += data[j];
        }

        return sum / band_width / 255;
      });

      // Single-pass smoothing
      const smoothed = values.map((val, i) => {
        const prev = previous_ref.current[i] || 0;
        const left = values[i - 1] || val;
        const right = values[i + 1] || val;
        return prev * 0.5 + val * 0.3 + left * 0.1 + right * 0.1;
      });

      previous_ref.current = smoothed;
      set_frequencies(smoothed);
      animation_frame = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(animation_frame);
    };
  }, [enabled, audio_element, bar_count]);

  return frequencies;
};

const idle_params_for_state = (
  state: AgentState
): { speed: number; amplitude: number; baseline: number } => {
  switch (state) {
    case "speaking":
      // Fallback when TTS audio analysis isn't available yet.
      return { speed: 1.25, amplitude: 0.42, baseline: 0.05 };
    case "listening":
      return { speed: 1.05, amplitude: 0.32, baseline: 0.04 };
    case "thinking":
      return { speed: 0.75, amplitude: 0.26, baseline: 0.04 };
    case "connecting":
      return { speed: 0.9, amplitude: 0.20, baseline: 0.03 };
    case "initializing":
    default:
      return { speed: 0.8, amplitude: 0.16, baseline: 0.03 };
  }
};

const useIdleFrequencies = (
  enabled: boolean,
  bar_count: number,
  state: AgentState
): number[] => {
  const [frequencies, set_frequencies] = useState<number[]>(() =>
    Array(bar_count).fill(0)
  );
  const previous_ref = useRef<number[]>(Array(bar_count).fill(0));

  useEffect(() => {
    previous_ref.current = Array(bar_count).fill(0);
    const animation_frame = requestAnimationFrame(() => {
      set_frequencies(Array(bar_count).fill(0));
    });
    return () => cancelAnimationFrame(animation_frame);
  }, [bar_count]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const reduce_motion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce_motion) return;

    const { speed, amplitude, baseline } = idle_params_for_state(state);
    let animation_frame: number;
    const start_ms = performance.now();

    const update = (now_ms: number) => {
      const t = (now_ms - start_ms) / 1000;
      const drift = Math.sin(t * speed * 0.55) * 0.35;

      const values = Array.from({ length: bar_count }, (_, i) => {
        const x = bar_count <= 1 ? 0 : i / (bar_count - 1);
        // Keep edges alive, but emphasize the center.
        const envelope = 0.35 + 0.65 * Math.sin(Math.PI * x);

        const w1 = 0.5 + 0.5 * Math.sin(t * speed * 2.0 + x * 6.0 + drift);
        const w2 = 0.5 + 0.5 * Math.sin(t * speed * 3.1 + x * 11.0 - drift * 1.2);
        const flutter = 0.5 + 0.5 * Math.sin(t * speed * 10.0 + i * 0.73);

        const raw = w1 * 0.55 + w2 * 0.35 + flutter * 0.1; // 0..1-ish
        return clamp01(baseline + amplitude * envelope * raw);
      });

      const smoothed = values.map((val, i) => {
        const prev = previous_ref.current[i] ?? 0;
        return prev * 0.7 + val * 0.3;
      });

      previous_ref.current = smoothed;
      set_frequencies(smoothed);
      animation_frame = requestAnimationFrame(update);
    };

    animation_frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animation_frame);
  }, [enabled, bar_count, state]);

  return frequencies;
};

const has_audio_signal = (frequencies: number[]): boolean =>
  frequencies.some((v) => v > 0.002);

export const BarVisualizer = ({
  state,
  barCount = 40,
  audioElement = null,
  minHeight = 20,
  maxHeight = 100,
  centerAlign = true,
  className = "",
  barClassName = "bg-blue-400",
}: BarVisualizerProps) => {
  const is_tts_speaking = state === "speaking";
  const audio_frequencies = useAudioFrequencies(audioElement, is_tts_speaking, barCount);
  const can_use_audio = Boolean(is_tts_speaking && audioElement && has_audio_signal(audio_frequencies));
  const idle_frequencies = useIdleFrequencies(!can_use_audio, barCount, state);

  const bar_heights = (can_use_audio ? audio_frequencies : idle_frequencies).map((freq) => {
    // Audio-reactive bars during TTS.
    if (can_use_audio) {
      const shaped = Math.pow(freq, 1.55);
      const boosted = shaped * 5.5;
      const height = minHeight + Math.min(1, boosted) * (maxHeight - minHeight);
      return Math.max(minHeight, Math.min(maxHeight, height));
    }

    // Idle animation (also covers listening/thinking + audio fallback).
    const shaped = Math.pow(freq, 1.25);
    const height = minHeight + shaped * (maxHeight - minHeight);
    return Math.max(minHeight, Math.min(maxHeight, height));
  });

  const alignment = centerAlign ? "items-center" : "items-end";

  return (
    <div className={`flex w-full gap-1 ${alignment} ${className}`}>
      {bar_heights.map((height, index) => (
        <div
          key={index}
          className={`flex-1 rounded-full ${barClassName} will-change-transform`}
          style={{
            height: `${height}%`,
            transition: can_use_audio ? "height 0.08s ease-out" : "height 0.15s ease-out",
          }}
        />
      ))}
    </div>
  );
};
