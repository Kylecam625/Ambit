import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Wake word detection via OpenWakeWord WebSocket service              */
/*                                                                     */
/*  Streams raw 16 kHz PCM audio to a Python OpenWakeWord service      */
/*  over WebSocket. The service runs inference in real-time and sends   */
/*  back a detection event when the wake word is heard.                 */
/*                                                                     */
/*  A ring buffer keeps the last ~5 s of audio so that speech spoken   */
/*  *after* the wake word ("hey ambit, whats the weather") is captured */
/*  and can be forwarded to the OpenAI Realtime connection.            */
/* ------------------------------------------------------------------ */

/* ---- Constants ---- */

const SAMPLE_RATE = 16_000; // 16 kHz — matches OpenWakeWord expectation
const RING_BUFFER_SECONDS = 5;
const RING_BUFFER_SAMPLES = SAMPLE_RATE * RING_BUFFER_SECONDS;

/**
 * How many seconds of audio *after* the wake-word detection to include
 * in the pre-buffer that gets forwarded to OpenAI. This captures the
 * tail of "hey ambit, whats the weather today" so nothing is lost.
 */
const POST_WAKE_CAPTURE_MS = 300;

const COOLDOWN_MS = 3_000;
const WS_RECONNECT_DELAY_MS = 2_000;
const WS_MAX_RECONNECT_DELAY_MS = 30_000;

/** ScriptProcessorNode buffer size (must be power of 2). */
const PROCESSOR_BUFFER_SIZE = 4096;

/** How often we send audio to the service (ms). Smaller = lower latency. */
const SEND_INTERVAL_MS = 80; // ~1280 samples @ 16 kHz = 1 OWW frame

/* ---- Ring buffer (Float32) ---- */

class RingBuffer {
  private buffer: Float32Array;
  private write_pos = 0;
  private total_written = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

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

  clear(): void {
    this.write_pos = 0;
    this.total_written = 0;
  }
}

/* ---- Helpers ---- */

/** Convert Float32 audio → Int16 PCM bytes for the wake word service. */
const float32_to_int16_bytes = (samples: Float32Array): ArrayBuffer => {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16.buffer;
};

/* ---- Hook ---- */

export const use_wake_word = ({
  on_wake,
  enabled = true,
}: {
  /** Called when the wake word is detected. Receives a Float32Array of buffered
   *  audio (16 kHz) captured *after* the wake word — this is the user's query
   *  that should be forwarded to the OpenAI Realtime connection. */
  on_wake: (post_wake_audio: Float32Array) => void;
  enabled?: boolean;
}) => {
  const [is_listening, set_is_listening] = useState(false);

  const on_wake_ref = useRef(on_wake);
  const enabled_ref = useRef(enabled);

  // Audio resources
  const stream_ref = useRef<MediaStream | null>(null);
  const audio_ctx_ref = useRef<AudioContext | null>(null);
  const processor_ref = useRef<ScriptProcessorNode | null>(null);
  const ring_ref = useRef<RingBuffer | null>(null);

  // WebSocket
  const ws_ref = useRef<WebSocket | null>(null);
  const ws_reconnect_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ws_reconnect_delay_ref = useRef(WS_RECONNECT_DELAY_MS);
  const intentionally_stopped_ref = useRef(false);

  // Sending buffer — accumulate audio and send at regular intervals
  const send_buffer_ref = useRef<Float32Array>(new Float32Array(0));
  const send_timer_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cooldown
  const last_detection_ref = useRef(0);

  useEffect(() => { on_wake_ref.current = on_wake; }, [on_wake]);
  useEffect(() => { enabled_ref.current = enabled; }, [enabled]);

  /* ---- Get the WebSocket URL ---- */
  const get_ws_url = useCallback((): string => {
    // Use NEXT_PUBLIC env var (available in browser)
    const env_url =
      typeof process !== "undefined"
        ? (process.env?.NEXT_PUBLIC_WAKE_WORD_SERVICE_URL ?? "")
        : "";
    if (env_url) return env_url.replace(/\/$/, "") + "/ws";
    return "ws://localhost:9876/ws";
  }, []);

  /* ---- Send accumulated audio to the service ---- */
  const flush_send_buffer = useCallback(() => {
    const ws = ws_ref.current;
    const buf = send_buffer_ref.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || buf.length === 0) return;

    try {
      ws.send(float32_to_int16_bytes(buf));
    } catch {
      // WebSocket may have closed between the check and the send
    }
    send_buffer_ref.current = new Float32Array(0);
  }, []);

  /* ---- WebSocket connection ---- */
  const connect_ws = useCallback(() => {
    if (intentionally_stopped_ref.current) return;
    if (ws_ref.current && ws_ref.current.readyState <= WebSocket.OPEN) return;

    const url = get_ws_url();
    console.log("[WakeWord] Connecting to", url);

    const ws = new WebSocket(url);
    ws_ref.current = ws;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("[WakeWord] WebSocket connected");
      ws_reconnect_delay_ref.current = WS_RECONNECT_DELAY_MS; // reset backoff
    };

    ws.onmessage = (event) => {
      if (intentionally_stopped_ref.current) return;

      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        if (data.type === "wake_detected") {
          const now = Date.now();
          if (now - last_detection_ref.current < COOLDOWN_MS) return;
          last_detection_ref.current = now;

          console.log(
            `[WakeWord] *** WAKE DETECTED *** (model=${data.model}, score=${data.score})`
          );

          // Wait a tiny bit for any trailing speech to land in the ring buffer
          setTimeout(() => {
            const ring = ring_ref.current;
            // Grab the last ~POST_WAKE_CAPTURE_MS of audio as the user's query.
            // This is an approximation — the wake word may have ended up to ~200ms
            // before the detection event arrived, so we grab a generous buffer.
            const capture_samples = Math.ceil(
              (POST_WAKE_CAPTURE_MS / 1000) * SAMPLE_RATE
            );
            const post_wake = ring
              ? ring.read_last(capture_samples)
              : new Float32Array(0);

            on_wake_ref.current(post_wake);
          }, POST_WAKE_CAPTURE_MS);
        }
      } catch {
        // non-JSON message, ignore
      }
    };

    ws.onclose = () => {
      ws_ref.current = null;
      if (intentionally_stopped_ref.current) return;

      // Reconnect with exponential backoff
      const delay = ws_reconnect_delay_ref.current;
      console.log(`[WakeWord] WebSocket closed, reconnecting in ${delay}ms`);
      ws_reconnect_timer_ref.current = setTimeout(() => {
        ws_reconnect_delay_ref.current = Math.min(
          delay * 2,
          WS_MAX_RECONNECT_DELAY_MS
        );
        connect_ws();
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, so reconnect logic is handled there
    };
  }, [get_ws_url, flush_send_buffer]);

  /* ---- Stop ---- */
  const stop_listening = useCallback(() => {
    intentionally_stopped_ref.current = true;

    // Stop send timer
    if (send_timer_ref.current) {
      clearInterval(send_timer_ref.current);
      send_timer_ref.current = null;
    }

    // Close WebSocket
    if (ws_reconnect_timer_ref.current) {
      clearTimeout(ws_reconnect_timer_ref.current);
      ws_reconnect_timer_ref.current = null;
    }
    if (ws_ref.current) {
      ws_ref.current.onclose = null; // prevent reconnect
      ws_ref.current.close();
      ws_ref.current = null;
    }

    // Disconnect audio nodes
    const proc = processor_ref.current;
    if (proc) {
      proc.disconnect();
      processor_ref.current = null;
    }

    if (audio_ctx_ref.current) {
      try { audio_ctx_ref.current.close(); } catch { /* noop */ }
      audio_ctx_ref.current = null;
    }

    if (stream_ref.current) {
      stream_ref.current.getTracks().forEach((t) => t.stop());
      stream_ref.current = null;
    }

    ring_ref.current?.clear();
    send_buffer_ref.current = new Float32Array(0);
    set_is_listening(false);
    console.log("[WakeWord] Stopped");
  }, []);

  /* ---- Start ---- */
  const start_listening = useCallback(async () => {
    stop_listening();
    intentionally_stopped_ref.current = false;

    try {
      // Mic capture at 16 kHz for OpenWakeWord
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

      // Ring buffer for capturing post-wake-word audio
      const ring = new RingBuffer(RING_BUFFER_SAMPLES);
      ring_ref.current = ring;

      // ScriptProcessorNode to capture PCM into ring buffer + send buffer
      const processor = ctx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        ring.push(input);

        // Accumulate for sending to the wake word service
        const prev = send_buffer_ref.current;
        const combined = new Float32Array(prev.length + input.length);
        combined.set(prev, 0);
        combined.set(input, prev.length);
        send_buffer_ref.current = combined;
      };
      processor_ref.current = processor;

      // Connect: source → processor → destination (required for ScriptProcessor to fire)
      const gain = ctx.createGain();
      gain.gain.value = 0; // mute monitoring
      source.connect(processor);
      processor.connect(gain);
      gain.connect(ctx.destination);

      // Start sending audio at a regular interval
      send_timer_ref.current = setInterval(flush_send_buffer, SEND_INTERVAL_MS);

      // Connect WebSocket to the wake word service
      connect_ws();

      set_is_listening(true);
      console.log("[WakeWord] Listening started (OpenWakeWord WebSocket)");
    } catch (error) {
      console.warn("[WakeWord] Failed to start:", error);
      set_is_listening(false);
    }
  }, [stop_listening, flush_send_buffer, connect_ws]);

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
