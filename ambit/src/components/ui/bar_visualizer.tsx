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
        
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.55;
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

      // Use logarithmic distribution for more spread across frequency spectrum
      const values = Array.from({ length: bar_count }, (_, i) => {
        // Logarithmic mapping - more detail in lower frequencies (voice range)
        const log_pos = Math.pow(i / bar_count, 2.2);
        const freq_index = Math.floor(log_pos * data.length * 0.4); // Use lower 40% of spectrum
        const band_width = Math.max(4, Math.floor(data.length * 0.025));
        
        const start = freq_index;
        const end = Math.min(start + band_width, data.length);

        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += data[j];
        }

        return sum / (end - start) / 255;
      });

      // Temporal smoothing with previous values
      const time_smoothed = values.map((val, i) => {
        const prev = previous_ref.current[i] || 0;
        return prev * 0.6 + val * 0.4;
      });

      // Spatial smoothing - make neighboring bars influence each other
      const spatially_smoothed = time_smoothed.map((val, i) => {
        const left = time_smoothed[i - 1] || val;
        const right = time_smoothed[i + 1] || val;
        // Blend with neighbors for wave-like flow
        return val * 0.6 + left * 0.2 + right * 0.2;
      });

      previous_ref.current = time_smoothed;
      set_frequencies(spatially_smoothed);
      animation_frame = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(animation_frame);
    };
  }, [enabled, audio_element, bar_count]);

  return frequencies;
};

export const BarVisualizer = ({
  state,
  barCount = 40,
  audioElement = null,
  minHeight = 15,
  maxHeight = 90,
  centerAlign = true,
  className = "",
  barClassName = "bg-blue-400",
}: BarVisualizerProps) => {
  const is_speaking = state === "speaking";
  const frequencies = useAudioFrequencies(audioElement, is_speaking, barCount);

  const bar_heights = frequencies.map((freq) => {
    if (state !== "speaking") {
      return minHeight;
    }

    // Apply power curve for better spread and less intensity
    const shaped = Math.pow(freq, 0.95);
    const boosted = shaped * 5.5;
    const height = minHeight + Math.min(1, boosted) * (maxHeight - minHeight);
    return Math.max(minHeight, Math.min(maxHeight, height));
  });

  const alignment = centerAlign ? "items-center" : "items-end";

  return (
    <div className={`flex w-full gap-1 ${alignment} ${className}`}>
      {bar_heights.map((height, index) => (
        <div
          key={index}
          className={`flex-1 rounded-full ${barClassName}`}
          style={{
            height: `${height}%`,
            transition: is_speaking ? "height 0.05s ease-out" : "height 0.2s ease-out",
          }}
        />
      ))}
    </div>
  );
};
