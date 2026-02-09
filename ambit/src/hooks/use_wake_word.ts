import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Wake word detection via mic energy monitoring + Whisper             */
/*                                                                     */
/*  Captures raw PCM audio into a ring buffer using ScriptProcessorNode*/
/*  so the last ~1.5 s of audio is always available. When speech energy */
/*  is detected and then followed by silence, the relevant PCM is      */
/*  encoded as a WAV file and sent to Whisper for transcription.       */
/*                                                                     */
/*  Cost: ~$0.0001 per check (only when speech is detected).           */
/* ------------------------------------------------------------------ */

/* ---- Wake phrase patterns ---- */

const WAKE_PATTERNS: RegExp[] = [
  /\bhey\s+ambit\b/i,
  /\bhey\s+ambient\b/i,
  /\bhey\s+amber\b/i,
  /\bhey\s+ambert\b/i,
  /\bhey\s+am\s*bit\b/i,
  /\ba\s+ambit\b/i,
  /\bhey\s+emmett?\b/i,
  /\bhey\s+am\w*t\b/i,
];

const is_wake_phrase = (text: string): boolean =>
  WAKE_PATTERNS.some((p) => p.test(text));

/* ---- Constants ---- */

const SAMPLE_RATE = 16_000; // 16 kHz — plenty for speech, keeps files small
const ENERGY_THRESHOLD = 0.012;
const SPEECH_ONSET_MS = 150;
const SILENCE_AFTER_SPEECH_MS = 600;
const MAX_SPEECH_MS = 4_000;
/** Pre-roll: how many seconds of audio to keep before speech onset. */
const PRE_ROLL_SECONDS = 1.0;
const PRE_ROLL_SAMPLES = Math.ceil(SAMPLE_RATE * PRE_ROLL_SECONDS);
/** Ring buffer size: pre-roll + max speech duration with padding. */
const RING_BUFFER_SAMPLES = Math.ceil(SAMPLE_RATE * (PRE_ROLL_SECONDS + MAX_SPEECH_MS / 1000 + 1));
const COOLDOWN_MS = 3_000;
const CHECK_COOLDOWN_MS = 800;
const POLL_INTERVAL_MS = 50;

/* ---- WAV encoder ---- */

const encode_wav = (samples: Float32Array, sample_rate: number): Blob => {
  const num_samples = samples.length;
  const bytes_per_sample = 2; // 16-bit PCM
  const data_size = num_samples * bytes_per_sample;
  const buffer = new ArrayBuffer(44 + data_size);
  const view = new DataView(buffer);

  const write_string = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  write_string(0, "RIFF");
  view.setUint32(4, 36 + data_size, true);
  write_string(8, "WAVE");

  // fmt chunk
  write_string(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sample_rate, true);
  view.setUint32(28, sample_rate * bytes_per_sample, true); // byte rate
  view.setUint16(32, bytes_per_sample, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  write_string(36, "data");
  view.setUint32(40, data_size, true);

  // Convert float32 → int16
  let offset = 44;
  for (let i = 0; i < num_samples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
};

/* ---- Ring buffer ---- */

class RingBuffer {
  private buffer: Float32Array;
  private write_pos = 0;
  private total_written = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  /** Append samples to the ring buffer. */
  push(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.write_pos] = samples[i];
      this.write_pos = (this.write_pos + 1) % this.buffer.length;
    }
    this.total_written += samples.length;
  }

  /** Read the last `count` samples in chronological order. */
  read_last(count: number): Float32Array {
    const available = Math.min(count, this.total_written, this.buffer.length);
    const result = new Float32Array(available);
    let read_pos =
      (this.write_pos - available + this.buffer.length) % this.buffer.length;
    for (let i = 0; i < available; i++) {
      result[i] = this.buffer[read_pos];
      read_pos = (read_pos + 1) % this.buffer.length;
    }
    return result;
  }

  /** Reset the buffer. */
  clear(): void {
    this.write_pos = 0;
    this.total_written = 0;
  }
}

/* ---- Types ---- */

type ListenerPhase =
  | "idle"
  | "onset"
  | "speech"
  | "trailing"
  | "checking"
  | "cooldown";

/* ---- Hook ---- */

export const use_wake_word = ({
  on_wake,
  enabled = true,
}: {
  on_wake: () => void;
  enabled?: boolean;
}) => {
  const [is_listening, set_is_listening] = useState(false);

  const on_wake_ref = useRef(on_wake);
  const enabled_ref = useRef(enabled);

  // Audio resources
  const stream_ref = useRef<MediaStream | null>(null);
  const audio_ctx_ref = useRef<AudioContext | null>(null);
  const analyser_ref = useRef<AnalyserNode | null>(null);
  const processor_ref = useRef<ScriptProcessorNode | null>(null);
  const ring_ref = useRef<RingBuffer | null>(null);

  // State machine
  const phase_ref = useRef<ListenerPhase>("idle");
  const onset_start_ref = useRef(0);
  const speech_start_ref = useRef(0);
  const silence_start_ref = useRef(0);
  const poll_timer_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionally_stopped_ref = useRef(false);

  useEffect(() => { on_wake_ref.current = on_wake; }, [on_wake]);
  useEffect(() => { enabled_ref.current = enabled; }, [enabled]);

  /* ---- Compute RMS from analyser ---- */
  const get_rms = useCallback((): number => {
    const analyser = analyser_ref.current;
    if (!analyser) return 0;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }, []);

  /* ---- Send audio to Whisper ---- */
  const check_audio = useCallback(async (wav_blob: Blob) => {
    try {
      const form = new FormData();
      form.append("audio", wav_blob, "wake.wav");
      const response = await fetch("/api/wake-word/check", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        console.warn("[WakeWord] Whisper check failed:", response.status);
        return null;
      }
      const data = await response.json();
      const transcript =
        typeof data?.transcript === "string" ? data.transcript : "";
      console.log(`[WakeWord] Whisper transcript: "${transcript}"`);
      return transcript;
    } catch (error) {
      console.warn("[WakeWord] Check error:", error);
      return null;
    }
  }, []);

  /* ---- Extract audio from ring buffer and check ---- */
  const finalize_and_check = useCallback(async () => {
    phase_ref.current = "checking";
    const ring = ring_ref.current;
    if (!ring) {
      phase_ref.current = "idle";
      return;
    }

    // How many samples to extract: pre-roll + speech duration
    const speech_duration_ms = Date.now() - speech_start_ref.current;
    const speech_samples = Math.ceil((speech_duration_ms / 1000) * SAMPLE_RATE);
    const total_samples = PRE_ROLL_SAMPLES + speech_samples;

    const pcm = ring.read_last(total_samples);
    const duration_ms = (pcm.length / SAMPLE_RATE) * 1000;
    console.log(
      `[WakeWord] Encoding WAV (${Math.round(duration_ms)}ms, ${pcm.length} samples)`
    );

    // Skip very short clips
    if (pcm.length < SAMPLE_RATE * 0.3) {
      console.log("[WakeWord] Clip too short, skipping");
      phase_ref.current = "idle";
      return;
    }

    const wav = encode_wav(pcm, SAMPLE_RATE);
    const transcript = await check_audio(wav);

    if (intentionally_stopped_ref.current) return;

    if (transcript && is_wake_phrase(transcript)) {
      console.log("[WakeWord] *** WAKE PHRASE MATCHED ***");
      phase_ref.current = "cooldown";
      on_wake_ref.current();
      return;
    }

    phase_ref.current = "cooldown";
    setTimeout(() => {
      if (!intentionally_stopped_ref.current && enabled_ref.current) {
        phase_ref.current = "idle";
      }
    }, CHECK_COOLDOWN_MS);
  }, [check_audio]);

  /* ---- Poll loop ---- */
  const start_polling = useCallback(() => {
    if (poll_timer_ref.current) clearInterval(poll_timer_ref.current);
    phase_ref.current = "idle";

    poll_timer_ref.current = setInterval(() => {
      if (intentionally_stopped_ref.current) return;

      const rms = get_rms();
      const now = Date.now();
      const is_loud = rms > ENERGY_THRESHOLD;
      const phase = phase_ref.current;

      switch (phase) {
        case "idle":
          if (is_loud) {
            onset_start_ref.current = now;
            phase_ref.current = "onset";
          }
          break;

        case "onset":
          if (!is_loud) {
            phase_ref.current = "idle";
          } else if (now - onset_start_ref.current >= SPEECH_ONSET_MS) {
            speech_start_ref.current = now;
            phase_ref.current = "speech";
            console.log("[WakeWord] Speech detected, capturing...");
          }
          break;

        case "speech":
          if (!is_loud) {
            silence_start_ref.current = now;
            phase_ref.current = "trailing";
          } else if (now - speech_start_ref.current >= MAX_SPEECH_MS) {
            void finalize_and_check();
          }
          break;

        case "trailing":
          if (is_loud) {
            phase_ref.current = "speech";
          } else if (now - silence_start_ref.current >= SILENCE_AFTER_SPEECH_MS) {
            void finalize_and_check();
          }
          break;
      }
    }, POLL_INTERVAL_MS);
  }, [get_rms, finalize_and_check]);

  /* ---- Stop ---- */
  const stop_listening = useCallback(() => {
    intentionally_stopped_ref.current = true;

    if (poll_timer_ref.current) {
      clearInterval(poll_timer_ref.current);
      poll_timer_ref.current = null;
    }

    // Disconnect and close the ScriptProcessorNode
    const proc = processor_ref.current;
    if (proc) {
      proc.disconnect();
      processor_ref.current = null;
    }

    if (audio_ctx_ref.current) {
      try { audio_ctx_ref.current.close(); } catch { /* noop */ }
      audio_ctx_ref.current = null;
    }
    analyser_ref.current = null;

    if (stream_ref.current) {
      stream_ref.current.getTracks().forEach((t) => t.stop());
      stream_ref.current = null;
    }

    ring_ref.current?.clear();
    phase_ref.current = "idle";
    set_is_listening(false);
    console.log("[WakeWord] Stopped");
  }, []);

  /* ---- Start ---- */
  const start_listening = useCallback(async () => {
    stop_listening();
    intentionally_stopped_ref.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      stream_ref.current = stream;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audio_ctx_ref.current = ctx;
      const source = ctx.createMediaStreamSource(stream);

      // AnalyserNode for RMS energy monitoring
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser_ref.current = analyser;

      // ScriptProcessorNode to capture raw PCM into ring buffer
      const ring = new RingBuffer(RING_BUFFER_SAMPLES);
      ring_ref.current = ring;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        ring.push(input);
      };
      processor_ref.current = processor;

      // Connect: source → analyser → processor → destination (required for ScriptProcessor)
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(ctx.destination);

      start_polling();
      set_is_listening(true);
      console.log("[WakeWord] Listening started (PCM ring buffer + Whisper)");
    } catch (error) {
      console.warn("[WakeWord] Failed to start:", error);
      set_is_listening(false);
    }
  }, [stop_listening, start_polling]);

  /* ---- Auto-start/stop ---- */
  useEffect(() => {
    if (enabled) {
      void start_listening();
    } else {
      stop_listening();
    }
    return () => { stop_listening(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    is_listening,
    is_supported: true,
    start_listening,
    stop_listening,
  };
};
