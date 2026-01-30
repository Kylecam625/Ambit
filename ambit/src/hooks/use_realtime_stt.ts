import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeTranscriptionClient,
  RealtimeTranscriptDelta,
} from "@/lib/realtime/realtime_client";
import {
  clear_session_conversation_state,
  load_session_conversation_state,
  persist_session_conversation_state,
} from "@/lib/realtime/session_conversation_storage";
import { strip_elevenlabs_v3_audio_tags_from_messages, strip_elevenlabs_v3_audio_tags } from "@/lib/elevenlabs/elevenlabs_audio_tags";
import { strip_citations } from "@/lib/elevenlabs/strip_citations";
import { parse_elevenlabs_stream_with_timestamps_jsonl } from "@/lib/elevenlabs/elevenlabs_alignment_to_words";

type mic_device = {
  device_id: string;
  label: string;
};

type voice_option = {
  voice_id: string;
  name: string;
  preview_url: string | null;
};

type conversation_message = {
  role: "user" | "assistant";
  content: string;
};

type ui_event = {
  type: string;
  [key: string]: unknown;
};

const MAX_CONVERSATION_MESSAGES = 50;
const MAX_CONVERSATION_MESSAGE_CHARS = 2000;
const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const find_suffix_prefix_overlap = (left: string, right: string): number => {
  const max_len = Math.min(left.length, right.length);
  for (let len = max_len; len > 0; len -= 1) {
    if (left.slice(-len) === right.slice(0, len)) {
      return len;
    }
  }
  return 0;
};

const merge_transcript_delta = ({
  current,
  delta,
}: {
  current: string;
  delta: string;
}): string => {
  if (!delta) return current;
  if (!current) return delta;

  // Some realtime transcription implementations emit the full partial transcript
  // (not just an append-only delta). Handle both safely.
  if (delta.startsWith(current)) return delta;
  if (current.endsWith(delta)) return current;

  const direct_overlap = find_suffix_prefix_overlap(current, delta);

  // Also handle a common overlap shape where the delta repeats the last word but
  // includes leading whitespace (e.g. " want to" after already having "...want").
  const left_trimmed = delta.replace(/^\s+/, "");
  const trimmed_overlap =
    left_trimmed !== delta ? find_suffix_prefix_overlap(current, left_trimmed) : 0;

  if (trimmed_overlap > direct_overlap && trimmed_overlap > 0) {
    return current + left_trimmed.slice(trimmed_overlap);
  }

  if (direct_overlap > 0) {
    return current + delta.slice(direct_overlap);
  }

  return current + delta;
};

const normalize_conversation_history = (value: unknown): conversation_message[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item): conversation_message | null => {
      if (!is_record(item)) return null;

      const role = item["role"];
      const content = item["content"];

      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string") return null;

      const trimmed = content.trim();
      if (!trimmed) return null;

      return {
        role,
        content: trimmed.slice(0, MAX_CONVERSATION_MESSAGE_CHARS),
      };
    })
    .filter((item): item is conversation_message => Boolean(item));

  return normalized.slice(-MAX_CONVERSATION_MESSAGES);
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

void MAX_CONVERSATION_MESSAGE_CHARS;

export const useRealtimeStt = ({
  profile_id = null,
  capture_camera_frame = null,
  quality_mode = "quality",
}: {
  profile_id?: string | null;
  capture_camera_frame?: (() => Promise<string | null>) | null;
  quality_mode?: "quality" | "fast";
} = {}) => {
  // Conversation state is intentionally shared across profile switches.
  // Profile switching should change identity context (profile_id) without wiping conversation history.
  const initial_session = load_session_conversation_state(null);

  const client_ref = useRef<RealtimeTranscriptionClient | null>(null);
  const response_request_id_ref = useRef(0);
  const response_abort_ref = useRef<AbortController | null>(null);
  const last_spoken_text_ref = useRef("");
  const last_transcript_done_ref = useRef<{ text: string; at_ms: number } | null>(null);
  const tts_request_id_ref = useRef(0);
  const tts_queued_for_response_id_ref = useRef(0);
  const active_tts_requests_ref = useRef<Set<number>>(new Set());
  const image_task_pollers_ref = useRef<
    Record<
      string,
      {
        abort_controller: AbortController;
        timeout_id: number | null;
        started_at_ms: number;
        last_partial_image_index: number | null;
      }
    >
  >({});
  const latest_image_task_id_ref = useRef<string | null>(null);
  const pending_ui_events_ref = useRef<ui_event[]>([]);
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const audio_url_ref = useRef<string | null>(null);
  const [word_alignment, set_word_alignment] = useState<Array<{
    word: string;
    start_time: number;
    end_time: number;
  }> | null>(null);
  const [tts_text, set_tts_text] = useState<string>("");
  const profile_id_ref = useRef<string | null>(profile_id);
  const current_profile_id_ref = useRef<string | null>(profile_id);
  const conversation_history_ref = useRef<conversation_message[]>(
    initial_session.conversation_history
  );
  const previous_response_id_ref = useRef<string | null>(initial_session.previous_response_id);
  const conversation_id_ref = useRef<string | null>(initial_session.conversation_id);
  const message_seq_ref = useRef<number>(initial_session.message_seq);
  const [tts_audio_element, set_tts_audio_element] = useState<HTMLAudioElement | null>(
    null
  );
  const [is_connected, set_is_connected] = useState(false);
  const [is_speaking, set_is_speaking] = useState(false);
  const is_speaking_ref = useRef(false);
  const [is_responding, set_is_responding] = useState(false);
  const [is_generating_tts, set_is_generating_tts] = useState(false);
  const [is_tts_playing, set_is_tts_playing] = useState(false);
  const [is_loading_mics, set_is_loading_mics] = useState(false);
  const [mic_devices, set_mic_devices] = useState<mic_device[]>([]);
  // Keep the initial render deterministic between SSR + client hydration.
  // Saved mic/voice are loaded after mount in `load_mics()` / `load_voices()`.
  const [selected_mic_id, set_selected_mic_id] = useState<string | null>(null);
  const selected_mic_id_ref = useRef<string | null>(null);
  const [media_stream, set_media_stream] = useState<MediaStream | null>(null);
  const [is_loading_voices, set_is_loading_voices] = useState(false);
  const [voice_options, set_voice_options] = useState<voice_option[]>([]);
  const [selected_voice_id, set_selected_voice_id] = useState<string | null>(null);
  const selected_voice_id_ref = useRef<string | null>(null);
  const [voice_error, set_voice_error] = useState<string | null>(null);
  const [transcript, set_transcript] = useState("");
  const [response_text, set_response_text] = useState("");
  const [used_web_search, set_used_web_search] = useState(false);
  const [ui_events, set_ui_events] = useState<ui_event[]>([]);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [response_error, set_response_error] = useState<string | null>(null);
  const [conversation_history, set_conversation_history] = useState<
    conversation_message[]
  >(() => initial_session.conversation_history);
  const [previous_response_id, set_previous_response_id] = useState<string | null>(
    () => initial_session.previous_response_id
  );
  const [conversation_id, set_conversation_id] = useState<string | null>(
    () => initial_session.conversation_id
  );
  const [message_seq, set_message_seq] = useState<number>(() => initial_session.message_seq);

  // Keep profile_id_ref in sync with the prop
  useEffect(() => {
    profile_id_ref.current = profile_id;
  }, [profile_id]);

  // Keep mic/voice refs in sync with state so callbacks don't capture stale values.
  useEffect(() => {
    selected_mic_id_ref.current = selected_mic_id;
  }, [selected_mic_id]);

  useEffect(() => {
    selected_voice_id_ref.current = selected_voice_id;
  }, [selected_voice_id]);

  // Read saved selections after mount (SSR-safe), but keep the initial render deterministic.
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved_mic_id = window.localStorage.getItem("ambit_selected_mic_id");
      if (saved_mic_id && !selected_mic_id_ref.current) {
        selected_mic_id_ref.current = saved_mic_id;
        set_selected_mic_id((current) => current ?? saved_mic_id);
      }

      const saved_voice_id = window.localStorage.getItem("ambit_selected_voice_id");
      if (saved_voice_id && !selected_voice_id_ref.current) {
        selected_voice_id_ref.current = saved_voice_id;
        set_selected_voice_id((current) => current ?? saved_voice_id);
      }
    } catch {
      // ignore localStorage issues
    }
  }, []);

  useEffect(() => {
    conversation_history_ref.current = conversation_history;
  }, [conversation_history]);

  useEffect(() => {
    previous_response_id_ref.current = previous_response_id;
  }, [previous_response_id]);

  useEffect(() => {
    conversation_id_ref.current = conversation_id;
  }, [conversation_id]);

  useEffect(() => {
    message_seq_ref.current = message_seq;
  }, [message_seq]);

  // When profile changes, load that profile's conversation (strict isolation).
  useEffect(() => {
    if (current_profile_id_ref.current === profile_id) {
      return; // No change
    }

    // Profile changed! Load the new profile's conversation state
    current_profile_id_ref.current = profile_id;

    const new_session = load_session_conversation_state(profile_id);
    
    // Update refs immediately (avoid stale closures)
    conversation_history_ref.current = new_session.conversation_history;
    previous_response_id_ref.current = new_session.previous_response_id;
    conversation_id_ref.current = new_session.conversation_id;
    message_seq_ref.current = new_session.message_seq;

    set_conversation_history(new_session.conversation_history);
    set_previous_response_id(new_session.previous_response_id);
    set_conversation_id(new_session.conversation_id);
    set_message_seq(new_session.message_seq);

    // Clear UI state when switching profiles
    set_transcript("");
    set_response_text("");
    set_error_message(null);
    set_response_error(null);
  }, [profile_id]);

  // Persist conversation state for the current profile.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      persist_session_conversation_state({
        conversation_history,
        previous_response_id,
        conversation_id,
        message_seq,
        profile_id,
      });

    } catch {
      return;
    }
  }, [
    conversation_history,
    previous_response_id,
    conversation_id,
    message_seq,
    profile_id,
  ]);

  const stop_audio = useCallback(() => {
    const audio = audio_ref.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (audio_url_ref.current) {
      URL.revokeObjectURL(audio_url_ref.current);
      audio_url_ref.current = null;
    }
    set_tts_audio_element(null);
    set_is_generating_tts(false);
    set_is_tts_playing(false);
    set_word_alignment(null);
    set_tts_text("");
  }, []);

  const cancel_tts = useCallback(() => {
    tts_request_id_ref.current += 1;
    stop_audio();
  }, [stop_audio]);

  const cancel_response = useCallback(() => {
    response_request_id_ref.current += 1;

    const controller = response_abort_ref.current;
    if (controller) {
      controller.abort();
      response_abort_ref.current = null;
    }

    set_is_responding(false);
  }, []);

  const cancel_inflight = useCallback(() => {
    cancel_response();
    cancel_tts();
  }, [cancel_response, cancel_tts]);

  const stop_image_task_polling = useCallback((task_id: string) => {
    const trimmed = task_id.trim();
    if (!trimmed) return;

    const pollers = image_task_pollers_ref.current;
    const active = pollers[trimmed];
    if (!active) return;

    if (active.timeout_id !== null) {
      window.clearTimeout(active.timeout_id);
      active.timeout_id = null;
    }

    active.abort_controller.abort();
    delete pollers[trimmed];
  }, []);

  const stop_all_image_task_polling = useCallback(() => {
    const pollers = image_task_pollers_ref.current;
    for (const task_id of Object.keys(pollers)) {
      stop_image_task_polling(task_id);
    }
  }, [stop_image_task_polling]);

  const flush_pending_ui_events = useCallback(() => {
    const pending = pending_ui_events_ref.current;
    if (pending.length === 0) return;
    pending_ui_events_ref.current = [];
    set_ui_events((current) => [...current, ...pending]);
  }, []);

  const start_image_task_polling = useCallback(
    ({ task_id }: { task_id: string }) => {
      const trimmed = task_id.trim();
      if (!trimmed) return;

      const pollers = image_task_pollers_ref.current;
      if (pollers[trimmed]) return;

      const abort_controller = new AbortController();
      pollers[trimmed] = {
        abort_controller,
        timeout_id: null,
        started_at_ms: Date.now(),
        last_partial_image_index: null,
      };

      const poll_once = async (): Promise<void> => {
        const active = image_task_pollers_ref.current[trimmed];
        if (!active) return;
        if (active.abort_controller.signal.aborted) return;

        const age_ms = Date.now() - active.started_at_ms;
        if (age_ms > 1000 * 60 * 10) {
          set_ui_events((current) => [
            ...current,
            { type: "image_task_timeout", task_id: trimmed },
          ]);
          stop_image_task_polling(trimmed);
          return;
        }

        try {
          const response = await fetch(`/api/realtime/image_task/${encodeURIComponent(trimmed)}`, {
            method: "GET",
            signal: active.abort_controller.signal,
          });

          const data = await response.json().catch(() => null);

          if (!response.ok) {
            active.timeout_id = window.setTimeout(() => void poll_once(), 1000);
            return;
          }

          const status = typeof data?.status === "string" ? String(data.status).trim() : "";

          const partial_image_data_url =
            typeof data?.partial_image_data_url === "string"
              ? String(data.partial_image_data_url)
              : "";
          const partial_image_index =
            typeof data?.partial_image_index === "number" && Number.isFinite(data.partial_image_index)
              ? Math.max(0, Math.floor(data.partial_image_index))
              : null;

          if (
            status !== "succeeded" &&
            status !== "failed" &&
            partial_image_data_url &&
            partial_image_index !== null &&
            (active.last_partial_image_index === null ||
              partial_image_index > active.last_partial_image_index)
          ) {
            active.last_partial_image_index = partial_image_index;
            set_ui_events((current) => [
              ...current,
              {
                type: "image_task_partial",
                task_id: trimmed,
                partial_image_index,
                image_data_url: partial_image_data_url,
              },
            ]);
          }

          if (status === "succeeded") {
            const image_data_url =
              typeof data?.image_data_url === "string" ? String(data.image_data_url) : "";

            if (image_data_url) {
              const display_event: ui_event = {
                type: "display_image",
                image_data_url,
                display_ms: 5000,
                task_id: trimmed,
              };

              if (is_speaking_ref.current) {
                pending_ui_events_ref.current = [...pending_ui_events_ref.current, display_event];
              } else {
                set_ui_events((current) => [...current, display_event]);
              }
            }

            stop_image_task_polling(trimmed);
            return;
          }

          if (status === "failed") {
            const err =
              typeof data?.error === "string" ? String(data.error) : "Image generation failed";
            set_ui_events((current) => [
              ...current,
              { type: "image_task_failed", task_id: trimmed, error: err },
            ]);
            stop_image_task_polling(trimmed);
            return;
          }

          active.timeout_id = window.setTimeout(() => void poll_once(), 750);
        } catch {
          if (active.abort_controller.signal.aborted) return;
          active.timeout_id = window.setTimeout(() => void poll_once(), 1000);
        }
      };

      void poll_once();
    },
    [stop_image_task_polling]
  );

  const maybe_start_image_task_polling = useCallback(
    ({ ui_events }: { ui_events: unknown[] }) => {
      for (const event of ui_events) {
        if (!is_record(event)) continue;
        if (event["type"] !== "image_task_started") continue;
        const task_id = typeof event["task_id"] === "string" ? event["task_id"].trim() : "";
        if (!task_id) continue;
        latest_image_task_id_ref.current = task_id;
        start_image_task_polling({ task_id });
      }
    },
    [start_image_task_polling]
  );

  useEffect(() => {
    return () => {
      stop_all_image_task_polling();
      pending_ui_events_ref.current = [];
    };
  }, [stop_all_image_task_polling]);

  const request_tts = useCallback(
    async ({ text }: { text: string }) => {
      const trimmed = text.trim();

      if (!trimmed) {
        return;
      }

      // Strip citations for speech
      const text_without_citations = strip_citations(trimmed);

      if (!text_without_citations) {
        return;
      }
      
      // For alignment matching: strip audio tags (API will also strip them for alignment endpoint)
      const text_for_alignment = strip_elevenlabs_v3_audio_tags(text_without_citations);

      const request_id = tts_request_id_ref.current + 1;
      tts_request_id_ref.current = request_id;
      
      // Cancel any pending requests for the same or similar text
      const is_duplicate = active_tts_requests_ref.current.size > 0;
      if (is_duplicate) {
        console.log(`[TTS #${request_id}] CANCELLED - duplicate request (${active_tts_requests_ref.current.size} already active)`);
        return;
      }
      
      active_tts_requests_ref.current.add(request_id);
      
      console.log(`[TTS #${request_id}] Request initiated`);
      console.log(`[TTS #${request_id}] Text: "${text_without_citations.substring(0, 100)}${text_without_citations.length > 100 ? '...' : ''}"`);
      
      stop_audio();
      set_is_generating_tts(true);
      set_tts_text(text_for_alignment); // Store cleaned text for alignment matching

      const timing = {
        tts_start: Date.now(),
        first_chunk: 0,
        all_chunks_received: 0,
        audio_ready: 0,
        playback_started: 0,
      };

      try {
        const response = await fetch("/api/realtime/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text_without_citations,
            voice_id: selected_voice_id,
            quality_mode,
            optimize_latency: 2, // Level 2 = ~75% latency improvement with good quality
          }),
        });

        timing.first_chunk = Date.now();
        console.log(`[TTS] First byte received in ${timing.first_chunk - timing.tts_start}ms`);

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const message =
            typeof data?.error === "string" ? data.error : "Failed to generate audio";
          throw new Error(message);
        }

        if (tts_request_id_ref.current !== request_id) {
          return;
        }

        // Parse streaming JSONL response: audio bytes + character alignment → word alignment
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const parsed = await parse_elevenlabs_stream_with_timestamps_jsonl({
          reader,
          should_abort: () => tts_request_id_ref.current !== request_id,
        });

        timing.all_chunks_received = Date.now();

        if (!parsed) {
          return;
        }

        if (tts_request_id_ref.current !== request_id) {
          return;
        }

        const { audio_bytes, word_alignment: next_alignment, caption_text, debug } = parsed;

        if (next_alignment && caption_text) {
          console.log(
            `[TTS] Generated ${next_alignment.length} word timings from ${debug.total_chars} characters`
          );
          console.log(
            `[TTS] Caption text: "${caption_text.substring(0, 100)}${caption_text.length > 100 ? "..." : ""}"`
          );
          set_word_alignment(next_alignment);
          set_tts_text(caption_text);
        } else {
          set_word_alignment(null);
        }

        const audio_blob = new Blob([audio_bytes], { type: "audio/mpeg" });
        timing.audio_ready = Date.now();

        const url = URL.createObjectURL(audio_blob);
        audio_url_ref.current = url;
        const audio = audio_ref.current ?? new Audio();
        audio_ref.current = audio;
        set_tts_audio_element(audio);
        audio.src = url;
        audio.onplay = () => {
          timing.playback_started = Date.now();
          const total_time = timing.playback_started - timing.tts_start;
          const streaming_time = timing.all_chunks_received - timing.first_chunk;
          const processing_time = timing.audio_ready - timing.all_chunks_received;
          const buffer_time = timing.playback_started - timing.audio_ready;
          console.log(`[TTS] Audio playback started after ${total_time}ms (streaming: ${streaming_time}ms, processing: ${processing_time}ms, buffer: ${buffer_time}ms)`);
          set_is_generating_tts(false);
          set_is_tts_playing(true);
        };
        audio.onpause = () => set_is_tts_playing(false);
        audio.onerror = () => {
          set_is_generating_tts(false);
          set_is_tts_playing(false);
        };
        audio.onended = () => {
          console.log(`[TTS] Audio playback ended`);
          set_is_tts_playing(false);
          set_word_alignment(null);
          set_tts_text("");
          if (audio_url_ref.current === url) {
            URL.revokeObjectURL(url);
            audio_url_ref.current = null;
          }
        };
        
        // Start playback immediately (no artificial delay)
        await audio.play().catch(() => {
          set_is_tts_playing(false);
        });
      } catch (error) {
        console.error(`[TTS #${request_id}] Error:`, error);
        if (tts_request_id_ref.current !== request_id) {
          return;
        }
        set_is_generating_tts(false);
      } finally {
        // Remove from active requests
        active_tts_requests_ref.current.delete(request_id);
      }
    },
    [stop_audio, selected_voice_id, quality_mode]
  );

  const load_mics = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    set_is_loading_mics(true);
    let stream: MediaStream | null = null;

    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Microphone permission not granted yet
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audio_inputs = devices.filter((device) => device.kind === "audioinput");
      const next_mics = audio_inputs.map((device, index) => ({
        device_id: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));

      set_mic_devices(next_mics);
      
      // Load saved mic from localStorage if not already set
      const saved_mic_id = typeof window !== "undefined" 
        ? localStorage.getItem("ambit_selected_mic_id") 
        : null;
      
      set_selected_mic_id((current) => {
        // If already have a value, keep it if it's valid
        if (current && next_mics.some((device) => device.device_id === current)) {
          return current;
        }
        // Otherwise, try to use the saved value
        if (saved_mic_id && next_mics.some((device) => device.device_id === saved_mic_id)) {
          return saved_mic_id;
        }
        return null;
      });
    } catch {
      // Failed to load microphones
    } finally {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      set_is_loading_mics(false);
    }
  }, []);

  const select_mic = useCallback((device_id: string | null) => {
    set_selected_mic_id(device_id);
  }, []);

  const load_voices = useCallback(async () => {
    set_is_loading_voices(true);
    set_voice_error(null);

    try {
      const response = await fetch("/api/elevenlabs/voices");
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to load voices";
        throw new Error(message);
      }

      const voices = Array.isArray(data?.voices) ? data.voices : [];
      const normalized: voice_option[] = voices
        .map((voice: unknown): voice_option => {
          if (!is_record(voice)) {
            return { voice_id: "", name: "Unknown", preview_url: null };
          }

          const voice_id = voice["voice_id"];
          const name = voice["name"];
          const preview_url = voice["preview_url"];

          return {
            voice_id: typeof voice_id === "string" ? voice_id : "",
            name: typeof name === "string" ? name : "Unknown",
            preview_url: typeof preview_url === "string" ? preview_url : null,
          };
        })
        .filter((voice: voice_option) => voice.voice_id.length > 0);

      set_voice_options(normalized);
      const default_voice_id =
        typeof data?.default_voice_id === "string" ? data.default_voice_id : null;
      
      // Load saved voice from localStorage if not already set
      const saved_voice_id = typeof window !== "undefined" 
        ? localStorage.getItem("ambit_selected_voice_id") 
        : null;
      
      set_selected_voice_id((current) => {
        // If already have a value, keep it if it's valid
        if (current && normalized.some((voice) => voice.voice_id === current)) {
          return current;
        }
        // Otherwise, try to use the saved value
        if (saved_voice_id && normalized.some((voice) => voice.voice_id === saved_voice_id)) {
          return saved_voice_id;
        }
        // Fall back to default or first voice
        if (default_voice_id) {
          return default_voice_id;
        }
        return normalized[0]?.voice_id ?? null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load voices";
      set_voice_error(message);
    } finally {
      set_is_loading_voices(false);
    }
  }, []);

  const select_voice = useCallback((voice_id: string | null) => {
    set_selected_voice_id(voice_id);
  }, []);

  // Auto-load mics and voices on mount
  useEffect(() => {
    void load_mics();
    void load_voices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const request_response = useCallback(
    async ({ text }: { text: string }) => {
      const trimmed = text.trim();

      if (!trimmed) {
        return;
      }

      const timing = {
        request_start: Date.now(),
        json_received: 0,
      };

      console.log(`[OpenAI] User prompted: "${trimmed}"`);

      const request_id = response_request_id_ref.current + 1;
      response_request_id_ref.current = request_id;
      set_is_responding(true);
      set_response_error(null);
      set_response_text("");
      set_ui_events((current) => current.slice(-20));
      last_spoken_text_ref.current = "";
      response_abort_ref.current?.abort();
      const abort_controller = new AbortController();
      response_abort_ref.current = abort_controller;

      console.log(`[OpenAI] Sending request to /api/realtime/respond`);

      try {
        const current_message_seq = message_seq_ref.current;
        const next_message_seq = current_message_seq + 2;
        const current_profile_id = profile_id_ref.current;
        const current_history = conversation_history_ref.current;
        
        const body: Record<string, unknown> = {
          text: trimmed,
          history: current_history.slice(-MAX_CONVERSATION_MESSAGES),
          message_seq: next_message_seq,
        };

        if (current_profile_id) {
          body["profile_id"] = current_profile_id;
        }

        if (latest_image_task_id_ref.current) {
          body["active_image_task_id"] = latest_image_task_id_ref.current;
        }

        // Single JSON POST to /api/realtime/respond (no streaming fallback)
        const response = await fetch("/api/realtime/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abort_controller.signal,
        });

        const response_data = await response.json().catch(() => null);
        timing.json_received = Date.now();

        if (!response.ok) {
          const message =
            typeof response_data?.error === "string" ? response_data.error : "Failed to get a response";
          throw new Error(message);
        }

        const total_time = timing.json_received - timing.request_start;
        console.log(`[OpenAI] Response received in ${total_time}ms`);

        // Check if request was cancelled
        if (response_request_id_ref.current !== request_id) {
          return;
        }

        const tool_request = is_record(response_data?.tool_request) ? response_data.tool_request : null;

        if (tool_request) {
          const tool_name = typeof tool_request["name"] === "string" ? tool_request["name"] : "";
          const call_id = typeof tool_request["call_id"] === "string" ? tool_request["call_id"] : "";
          const tool_arguments = is_record(tool_request["arguments"]) ? tool_request["arguments"] : {};

          console.log(`[OpenAI] Tool request: ${tool_name} (call_id: ${call_id})`);

          if (tool_name !== "analyze_camera_frame") {
            throw new Error(`Unsupported tool request: ${tool_name || "unknown"}`);
          }
          if (!call_id) {
            throw new Error("Tool request missing call_id");
          }
          if (!capture_camera_frame) {
            throw new Error("Camera capture is not available");
          }

          // Camera startup can lag behind the tool request (permission prompt, device warm-up, etc).
          // Give it a little more time before falling back to an error-only tool output.
          const capture_attempts = 20;
          const capture_delay_ms = 150;
          let image_data_url: string | null = null;

          for (let attempt = 0; attempt < capture_attempts; attempt += 1) {
            if (abort_controller.signal.aborted) return;
            image_data_url = await capture_camera_frame();
            if (image_data_url) break;
            if (attempt < capture_attempts - 1) {
              await sleep(capture_delay_ms);
            }
          }

          const camera_tool_output = (() => {
            if (typeof window !== "undefined" && "isSecureContext" in window && !window.isSecureContext) {
              return (
                "I can’t access the camera because this page isn’t running in a secure context. " +
                "Open it on https:// (or use http://localhost), then allow camera access and try again."
              );
            }
            if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
              return (
                "I can’t access the camera in this browser. Please use a modern browser and allow camera permission."
              );
            }
            return (
              "I can’t access the camera yet. Please allow camera permission (browser lock icon) and try again."
            );
          })();

          // Use response_data (not data) to get the response_id and conversation_id
          const pending_response_id =
            typeof response_data?.response_id === "string" ? response_data.response_id : "";
          const pending_conversation_id =
            typeof response_data?.conversation_id === "string" ? response_data.conversation_id : "";

          console.log(`[OpenAI] Tool request: ${tool_name}, calling /api/realtime/tool`);

          const tool_response = await fetch("/api/realtime/tool", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tool_name: tool_name,
              call_id,
              tool_arguments,
              ...(image_data_url ? { image_data_url } : { tool_output: camera_tool_output }),
              previous_response_id: pending_response_id || null,
              conversation_id: pending_conversation_id || null,
              text: trimmed,
              history: current_history.slice(-MAX_CONVERSATION_MESSAGES),
              profile_id: current_profile_id,
              message_seq: next_message_seq,
            }),
            signal: abort_controller.signal,
          });

          const tool_data = await tool_response.json().catch(() => null);

          if (!tool_response.ok) {
            const message =
              typeof tool_data?.error === "string" ? tool_data.error : "Tool execution failed";
            throw new Error(message);
          }

          if (response_request_id_ref.current !== request_id) {
            return;
          }

          const next_response =
            typeof tool_data?.speech_text === "string"
              ? tool_data.speech_text
              : typeof tool_data?.response === "string"
                ? tool_data.response
                : "";
          const updated_history = strip_elevenlabs_v3_audio_tags_from_messages(
            normalize_conversation_history(tool_data?.history)
          );
          const next_ui_events = Array.isArray(tool_data?.ui_events) ? tool_data.ui_events : [];
          const response_id =
            typeof tool_data?.response_id === "string" ? tool_data.response_id : "";
          const next_conversation_id =
            typeof tool_data?.conversation_id === "string" ? tool_data.conversation_id : "";
          const response_used_web_search = 
            typeof tool_data?.used_web_search === "boolean" ? tool_data.used_web_search : false;

          set_response_text(next_response);
          set_used_web_search(response_used_web_search);
          set_ui_events((current) => [...current, ...next_ui_events].slice(-20));
          maybe_start_image_task_polling({ ui_events: next_ui_events });
          set_conversation_history(updated_history);
          conversation_history_ref.current = updated_history;

          if (response_id) {
            set_previous_response_id(response_id);
            previous_response_id_ref.current = response_id;
          }
          if (next_conversation_id) {
            set_conversation_id(next_conversation_id);
            conversation_id_ref.current = next_conversation_id;
          }

          message_seq_ref.current = next_message_seq;
          set_message_seq(next_message_seq);
          return;
        }

        // No tool call - use the response directly
        // Prefer speech_text from server
        const next_response =
          typeof response_data?.speech_text === "string"
            ? response_data.speech_text
            : typeof response_data?.text === "string"
              ? response_data.text
              : "";
        const updated_history = strip_elevenlabs_v3_audio_tags_from_messages(
          normalize_conversation_history(response_data?.history)
        );
        const next_ui_events = Array.isArray(response_data?.ui_events) ? response_data.ui_events : [];
        const response_id = typeof response_data?.response_id === "string" ? response_data.response_id : "";
        const next_conversation_id =
          typeof response_data?.conversation_id === "string" ? response_data.conversation_id : "";
        const response_used_web_search = 
          typeof response_data?.used_web_search === "boolean" ? response_data.used_web_search : false;

        console.log(`[OpenAI] Response text: "${next_response.substring(0, 150)}${next_response.length > 150 ? '...' : ''}"`);
        console.log(`[OpenAI] Used web search: ${response_used_web_search}`);

        set_response_text(next_response);
        set_used_web_search(response_used_web_search);
        set_ui_events((current) => [...current, ...next_ui_events].slice(-20));
        maybe_start_image_task_polling({ ui_events: next_ui_events });
        set_conversation_history(updated_history);
        conversation_history_ref.current = updated_history;

        if (response_id) {
          set_previous_response_id(response_id);
          previous_response_id_ref.current = response_id;
        }
        if (next_conversation_id) {
          set_conversation_id(next_conversation_id);
          conversation_id_ref.current = next_conversation_id;
        }

        message_seq_ref.current = next_message_seq;
        set_message_seq(next_message_seq);
      } catch (error) {
        if (abort_controller.signal.aborted) {
          return;
        }
        if (response_request_id_ref.current !== request_id) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to get a response";
        set_response_error(message);
      } finally {
        if (response_abort_ref.current === abort_controller) {
          response_abort_ref.current = null;
        }
        if (response_request_id_ref.current === request_id) {
          set_is_responding(false);
        }
      }
    },
    [capture_camera_frame, maybe_start_image_task_polling]
  );

  const handle_realtime_event = useCallback(
    (event: RealtimeTranscriptDelta) => {
      switch (event.type) {
        case "speech_started":
          // VAD detected user started speaking → barge-in
          console.log("[STT] Speech started - triggering barge-in");
          is_speaking_ref.current = true;
          set_is_speaking(true);
          set_transcript("");
          cancel_tts();
          cancel_response();
          break;

        case "speech_stopped":
          // VAD detected user stopped speaking
          console.log("[STT] Speech stopped");
          is_speaking_ref.current = false;
          set_is_speaking(false);
          flush_pending_ui_events();
          break;

        case "transcript_delta":
          // Live transcription text (display only)
          const delta_text = event.text;
          if (delta_text) {
            set_transcript((current) => {
              const next = merge_transcript_delta({ current: current || "", delta: delta_text });
              return next.slice(-MAX_CONVERSATION_MESSAGE_CHARS);
            });
          }
          break;

        case "transcript_done":
          // Final transcript ready → send to AI
          if (event.text) {
            const trimmed_text = event.text.trim();
            if (!trimmed_text) break;

            const now_ms = Date.now();
            const prev = last_transcript_done_ref.current;
            const is_dupe = Boolean(
              prev && prev.text === trimmed_text && now_ms - prev.at_ms < 1000
            );
            if (is_dupe) {
              console.log("[STT] Ignoring duplicate transcript_done");
              break;
            }
            last_transcript_done_ref.current = { text: trimmed_text, at_ms: now_ms };

            console.log(`[STT] Transcript finalized: "${trimmed_text}"`);
            set_transcript(trimmed_text);
            void request_response({ text: trimmed_text });
          }
          break;

        case "error":
          console.error("[STT] Transcription error:", event.error);
          is_speaking_ref.current = false;
          set_is_speaking(false);
          set_error_message(event.error || "Realtime transcription error");
          break;
      }
    },
    [request_response, cancel_tts, cancel_response, flush_pending_ui_events]
  );

  useEffect(() => {
    const trimmed = response_text.trim();

    if (!trimmed) {
      return;
    }

    if (last_spoken_text_ref.current === trimmed) {
      return;
    }

    // Debounce TTS requests to prevent spam during streaming
    // If text is still changing rapidly, wait for it to stabilize
    const debounce_timer = setTimeout(() => {
      if (last_spoken_text_ref.current === trimmed) {
        return; // Already sent
      }
      last_spoken_text_ref.current = trimmed;
      void request_tts({ text: trimmed });
      console.log(`[TTS] Triggered from useEffect with ${trimmed.split(/\s+/).length} words`);
    }, 150); // 150ms debounce to ensure streaming is complete

    return () => clearTimeout(debounce_timer);
  }, [response_text, request_tts]);

  const start_realtime = useCallback(async () => {
    if (is_connected) {
      return;
    }

    console.log("[System] Starting Ambit...");
    set_error_message(null);

    try {
      console.log("[System] Connecting to OpenAI Realtime API...");
      const client = new RealtimeTranscriptionClient();
      
      // Add timeout to connection (30s)
      const connect_timeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 30s")), 30000)
      );
      
      await Promise.race([
        client.connect(handle_realtime_event),
        connect_timeout
      ]);
      const saved_device_id = (() => {
        if (typeof window === "undefined") return null;
        try {
          const raw = window.localStorage.getItem("ambit_selected_mic_id");
          return typeof raw === "string" ? raw.trim() || null : null;
        } catch {
          return null;
        }
      })();

      const desired_device_id = selected_mic_id_ref.current ?? saved_device_id;

      const stream = await (async (): Promise<MediaStream> => {
        if (!desired_device_id) {
          return client.start_audio_stream();
        }

        try {
          return await client.start_audio_stream({ device_id: desired_device_id });
        } catch {
          // Fall back to default mic if specified device fails
          return client.start_audio_stream();
        }
      })();
      set_media_stream(stream);

      client_ref.current = client;
      set_is_connected(true);
      console.log("[System] Ambit ready - listening for speech");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start realtime transcription";
      set_error_message(message);
    }
  }, [is_connected, handle_realtime_event]);

  const stop_realtime = useCallback(() => {
    const client = client_ref.current;

    if (!client) {
      return;
    }

    client.disconnect();
    client_ref.current = null;
    set_is_connected(false);
    is_speaking_ref.current = false;
    set_is_speaking(false);
    set_media_stream(null);
    cancel_tts();
    cancel_response();
  }, [cancel_tts, cancel_response]);

  const reset_transcript = useCallback(() => {
    cancel_response();
    set_transcript("");
    set_response_text("");
    set_ui_events([]);
    set_error_message(null);
    set_response_error(null);
    is_speaking_ref.current = false;
    set_is_speaking(false);
    last_spoken_text_ref.current = "";
    cancel_tts();
  }, [cancel_tts, cancel_response]);

  const reset_conversation = useCallback(() => {
    cancel_response();
    set_transcript("");
    set_response_text("");
    set_ui_events([]);
    set_error_message(null);
    set_response_error(null);
    is_speaking_ref.current = false;
    set_is_speaking(false);
    set_conversation_history([]);
    set_previous_response_id(null);
    set_conversation_id(null);
    set_message_seq(0);
    conversation_history_ref.current = [];
    previous_response_id_ref.current = null;
    conversation_id_ref.current = null;
    message_seq_ref.current = 0;
    last_spoken_text_ref.current = "";
    cancel_tts();

    if (typeof window !== "undefined") {
      try {
        clear_session_conversation_state(null);
      } catch {
        // ignore
      }
    }
  }, [cancel_tts, cancel_response]);

  return {
    error_message,
    is_connected,
    is_loading_mics,
    is_loading_voices,
    is_speaking,
    is_responding,
    is_generating_tts,
    is_tts_playing,
    load_mics,
    load_voices,
    media_stream,
    mic_devices,
    cancel_inflight,
    reset_transcript,
    reset_conversation,
    response_error,
    response_text,
    used_web_search,
    ui_events,
    select_voice,
    select_mic,
    selected_mic_id,
    selected_voice_id,
    start_realtime,
    stop_realtime,
    transcript,
    tts_audio_element,
    voice_error,
    voice_options,
    word_alignment,
    tts_text,
  };
};
