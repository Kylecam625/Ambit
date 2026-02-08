import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeTranscriptionClient,
  RealtimeTranscriptDelta,
} from "@/lib/realtime/realtime_client";
import {
  strip_elevenlabs_v3_audio_tags_from_messages,
  strip_elevenlabs_v3_audio_tags,
} from "@/lib/elevenlabs/elevenlabs_audio_tags";
import { strip_citations } from "@/lib/elevenlabs/strip_citations";
import { parse_elevenlabs_stream_with_timestamps_jsonl } from "@/lib/elevenlabs/elevenlabs_alignment_to_words";

import {
  type word_timing,
  MAX_CONVERSATION_MESSAGES,
  MAX_CONVERSATION_MESSAGE_CHARS,
  is_record,
  normalize_conversation_history,
  sleep,
} from "./realtime_types";
import { useMicAndVoice } from "./use_mic_and_voice";
import { useConversationState } from "./use_conversation_state";
import { useImageTaskPolling } from "./use_image_task_polling";

/* ------------------------------------------------------------------ */
/*  Transcript merge helpers                                           */
/* ------------------------------------------------------------------ */

const find_suffix_prefix_overlap = (left: string, right: string): number => {
  const max_len = Math.min(left.length, right.length);
  for (let len = max_len; len > 0; len -= 1) {
    if (left.slice(-len) === right.slice(0, len)) return len;
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
  if (delta.startsWith(current)) return delta;
  if (current.endsWith(delta)) return current;

  const direct_overlap = find_suffix_prefix_overlap(current, delta);
  const left_trimmed = delta.replace(/^\s+/, "");
  const trimmed_overlap =
    left_trimmed !== delta
      ? find_suffix_prefix_overlap(current, left_trimmed)
      : 0;

  if (trimmed_overlap > direct_overlap && trimmed_overlap > 0)
    return current + left_trimmed.slice(trimmed_overlap);
  if (direct_overlap > 0) return current + delta.slice(direct_overlap);
  return current + delta;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STREAM_TIMEOUT_MS = 20_000;
const TTS_DEBOUNCE_MS = 150;
const CONNECTION_TIMEOUT_MS = 30_000;
const CAMERA_CAPTURE_ATTEMPTS = 20;
const CAMERA_CAPTURE_DELAY_MS = 150;

/* ------------------------------------------------------------------ */
/*  Main hook                                                          */
/* ------------------------------------------------------------------ */

export const useRealtimeStt = ({
  profile_id = null,
  capture_camera_frame = null,
  capture_screen_frame = null,
  quality_mode = "quality",
  detected_emotion = null,
}: {
  profile_id?: string | null;
  capture_camera_frame?: (() => Promise<string | null>) | null;
  capture_screen_frame?: (() => Promise<string | null>) | null;
  quality_mode?: "quality" | "fast";
  detected_emotion?: string | null;
} = {}) => {
  /* ---- Composed sub-hooks ---- */
  const mic_voice = useMicAndVoice();
  const conversation = useConversationState({ profile_id });
  const is_speaking_ref = useRef(false);
  const image_polling = useImageTaskPolling({ is_speaking_ref });

  /* ---- Connection state ---- */
  const client_ref = useRef<RealtimeTranscriptionClient | null>(null);
  const [is_connected, set_is_connected] = useState(false);
  const [is_speaking, set_is_speaking] = useState(false);

  /* ---- Response state ---- */
  const response_request_id_ref = useRef(0);
  const response_abort_ref = useRef<AbortController | null>(null);
  const last_spoken_text_ref = useRef("");
  const last_transcript_done_ref = useRef<{
    text: string;
    at_ms: number;
  } | null>(null);
  const profile_id_ref = useRef<string | null>(profile_id);
  const [is_responding, set_is_responding] = useState(false);
  const [transcript, set_transcript] = useState("");
  const [response_text, set_response_text] = useState("");
  const [used_web_search, set_used_web_search] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [response_error, set_response_error] = useState<string | null>(null);

  /* ---- TTS state ---- */
  const tts_request_id_ref = useRef(0);
  const active_tts_requests_ref = useRef<Set<number>>(new Set());
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const audio_url_ref = useRef<string | null>(null);
  const [word_alignment, set_word_alignment] = useState<word_timing[] | null>(
    null
  );
  const [tts_text, set_tts_text] = useState("");
  const [tts_audio_element, set_tts_audio_element] =
    useState<HTMLAudioElement | null>(null);
  const [is_generating_tts, set_is_generating_tts] = useState(false);
  const [is_tts_playing, set_is_tts_playing] = useState(false);

  // Keep profile_id ref in sync
  useEffect(() => {
    profile_id_ref.current = profile_id;
  }, [profile_id]);

  // Clear UI when profile changes
  useEffect(() => {
    set_transcript("");
    set_response_text("");
    set_error_message(null);
    set_response_error(null);
  }, [profile_id]);

  /* ---------------------------------------------------------------- */
  /*  TTS                                                              */
  /* ---------------------------------------------------------------- */

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

  const request_tts = useCallback(
    async ({ text }: { text: string }) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const text_without_citations = strip_citations(trimmed);
      if (!text_without_citations) return;

      const text_for_alignment = strip_elevenlabs_v3_audio_tags(
        text_without_citations
      );
      const request_id = tts_request_id_ref.current + 1;
      tts_request_id_ref.current = request_id;

      if (active_tts_requests_ref.current.size > 0) return;
      active_tts_requests_ref.current.add(request_id);

      stop_audio();
      set_is_generating_tts(true);
      set_tts_text(text_for_alignment);

      try {
        const response = await fetch("/api/realtime/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text_without_citations,
            voice_id: mic_voice.selected_voice_id,
            quality_mode,
            optimize_latency: 2,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Failed to generate audio"
          );
        }

        if (tts_request_id_ref.current !== request_id) return;

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const parsed = await parse_elevenlabs_stream_with_timestamps_jsonl({
          reader,
          should_abort: () => tts_request_id_ref.current !== request_id,
        });

        if (!parsed || tts_request_id_ref.current !== request_id) return;

        const { audio_bytes, word_alignment: next_alignment, caption_text } =
          parsed;

        if (next_alignment && caption_text) {
          set_word_alignment(next_alignment);
          set_tts_text(caption_text);
        } else {
          set_word_alignment(null);
        }

        const url = URL.createObjectURL(
          new Blob([audio_bytes as BlobPart], { type: "audio/mpeg" })
        );
        audio_url_ref.current = url;
        const audio = audio_ref.current ?? new Audio();
        audio_ref.current = audio;
        set_tts_audio_element(audio);
        audio.src = url;
        audio.onplay = () => {
          set_is_generating_tts(false);
          set_is_tts_playing(true);
        };
        audio.onpause = () => set_is_tts_playing(false);
        audio.onerror = () => {
          set_is_generating_tts(false);
          set_is_tts_playing(false);
        };
        audio.onended = () => {
          set_is_tts_playing(false);
          set_word_alignment(null);
          set_tts_text("");
          if (audio_url_ref.current === url) {
            URL.revokeObjectURL(url);
            audio_url_ref.current = null;
          }
        };
        await audio.play().catch(() => set_is_tts_playing(false));
      } catch (error) {
        console.error(`[TTS] Error:`, error);
        if (tts_request_id_ref.current !== request_id) return;
        set_is_generating_tts(false);
      } finally {
        active_tts_requests_ref.current.delete(request_id);
      }
    },
    [stop_audio, mic_voice.selected_voice_id, quality_mode]
  );

  /* ---------------------------------------------------------------- */
  /*  Response request (streaming + fallback)                          */
  /* ---------------------------------------------------------------- */

  const request_response = useCallback(
    async ({ text }: { text: string }) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const request_id = response_request_id_ref.current + 1;
      response_request_id_ref.current = request_id;
      set_is_responding(true);
      set_response_error(null);
      set_response_text("");
      image_polling.set_ui_events((current) => current.slice(-20));
      last_spoken_text_ref.current = "";
      response_abort_ref.current?.abort();
      const abort_controller = new AbortController();
      response_abort_ref.current = abort_controller;

      try {
        const current_message_seq = conversation.message_seq_ref.current;
        const next_message_seq = current_message_seq + 2;
        const current_profile_id = profile_id_ref.current;
        const current_history =
          conversation.conversation_history_ref.current;

        const body: Record<string, unknown> = {
          text: trimmed,
          history: current_history.slice(-MAX_CONVERSATION_MESSAGES),
          message_seq: next_message_seq,
        };
        if (current_profile_id) body["profile_id"] = current_profile_id;
        if (image_polling.latest_task_id_ref.current)
          body["active_image_task_id"] =
            image_polling.latest_task_id_ref.current;
        if (detected_emotion) body["detected_emotion"] = detected_emotion;

        const apply_response = ({
          speech_text,
          history,
          ui_events,
          response_id,
          conversation_id,
          used_web_search: ws,
        }: {
          speech_text: string;
          history: unknown;
          ui_events?: unknown;
          response_id?: string;
          conversation_id?: string;
          used_web_search?: boolean;
        }) => {
          const updated_history =
            strip_elevenlabs_v3_audio_tags_from_messages(
              normalize_conversation_history(history)
            );
          const next_ui = Array.isArray(ui_events) ? ui_events : [];

          set_response_text(speech_text);
          set_used_web_search(Boolean(ws));
          image_polling.set_ui_events((c) =>
            [...c, ...next_ui].slice(-20)
          );
          image_polling.maybe_start_image_task_polling({
            ui_events: next_ui,
          });

          conversation.update_from_response({
            history: updated_history,
            response_id,
            conversation_id,
            next_message_seq,
          });
        };

        /* --- Streaming path --- */
        const run_stream = async (): Promise<boolean> => {
          try {
            const stream_abort = new AbortController();
            const on_parent_abort = () => stream_abort.abort();
            abort_controller.signal.addEventListener(
              "abort",
              on_parent_abort,
              { once: true }
            );

            const timeout_id = window.setTimeout(() => {
              stream_abort.abort();
            }, STREAM_TIMEOUT_MS);

            let response: Response;
            try {
              response = await fetch("/api/realtime/respond/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: stream_abort.signal,
              });
            } catch (err) {
              clearTimeout(timeout_id);
              abort_controller.signal.removeEventListener(
                "abort",
                on_parent_abort
              );
              if (abort_controller.signal.aborted) throw err;
              return false;
            }

            if (!response.ok || !response.body) {
              clearTimeout(timeout_id);
              abort_controller.signal.removeEventListener(
                "abort",
                on_parent_abort
              );
              return false;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let accumulated_text = "";
            let done_payload: Record<string, unknown> | null = null;

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                clearTimeout(timeout_id);

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  const data_str = line.slice(6).trim();
                  if (!data_str) continue;

                  const event = JSON.parse(data_str) as unknown;
                  if (!is_record(event)) continue;

                  const et = event["type"];
                  if (et === "text_delta") {
                    const delta = event["delta"];
                    const accumulated = event["accumulated"];
                    if (
                      typeof delta === "string" ||
                      typeof accumulated === "string"
                    ) {
                      accumulated_text =
                        typeof accumulated === "string"
                          ? accumulated
                          : accumulated_text +
                            (typeof delta === "string" ? delta : "");
                      if (
                        response_request_id_ref.current === request_id
                      )
                        set_response_text(accumulated_text);
                    }
                    continue;
                  }
                  if (et === "requires_tool") return false;
                  if (et === "done") {
                    done_payload = event;
                    break;
                  }
                  if (et === "error") {
                    throw new Error(
                      typeof event["error"] === "string"
                        ? event["error"]
                        : "Streaming failed"
                    );
                  }
                }
                if (done_payload) break;
              }
            } finally {
              clearTimeout(timeout_id);
              abort_controller.signal.removeEventListener(
                "abort",
                on_parent_abort
              );
              reader.releaseLock();
            }

            if (!done_payload) return false;
            if (response_request_id_ref.current !== request_id)
              return true;

            const final_text =
              typeof done_payload["text"] === "string"
                ? done_payload["text"]
                : accumulated_text;
            if (!final_text.trim()) return false;

            apply_response({
              speech_text: final_text,
              history: done_payload["history"],
              ui_events: done_payload["ui_events"],
              response_id:
                typeof done_payload["response_id"] === "string"
                  ? done_payload["response_id"]
                  : "",
              conversation_id:
                typeof done_payload["conversation_id"] === "string"
                  ? done_payload["conversation_id"]
                  : "",
              used_web_search:
                typeof done_payload["used_web_search"] === "boolean"
                  ? done_payload["used_web_search"]
                  : false,
            });
            return true;
          } catch (error) {
            if (abort_controller.signal.aborted) throw error;
            return false;
          }
        };

        /* --- Non-streaming path (with tool handling) --- */
        const run_non_stream = async () => {
          if (abort_controller.signal.aborted) return;

          const response = await fetch("/api/realtime/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: abort_controller.signal,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              typeof data?.error === "string"
                ? data.error
                : "Failed to get a response"
            );
          }
          if (response_request_id_ref.current !== request_id) return;

          // Handle tool requests (camera analysis)
          const tool_request = is_record(data?.tool_request)
            ? data.tool_request
            : null;

          if (tool_request) {
            const tool_name =
              typeof tool_request["name"] === "string"
                ? tool_request["name"]
                : "";
            const call_id =
              typeof tool_request["call_id"] === "string"
                ? tool_request["call_id"]
                : "";
            const tool_arguments = is_record(tool_request["arguments"])
              ? tool_request["arguments"]
              : {};

            const is_screen_tool = tool_name === "analyze_screen";
            const is_camera_tool = tool_name === "analyze_camera_frame";

            if (!is_camera_tool && !is_screen_tool)
              throw new Error(
                `Unsupported tool: ${tool_name || "unknown"}`
              );
            if (!call_id) throw new Error("Tool request missing call_id");

            let image_data_url: string | null = null;

            if (is_screen_tool) {
              // Screen capture — single attempt
              if (capture_screen_frame) {
                image_data_url = await capture_screen_frame();
              }
            } else {
              // Camera capture — multiple attempts
              if (!capture_camera_frame)
                throw new Error("Camera capture unavailable");

              for (let i = 0; i < CAMERA_CAPTURE_ATTEMPTS; i++) {
                if (abort_controller.signal.aborted) return;
                image_data_url = await capture_camera_frame();
                if (image_data_url) break;
                if (i < CAMERA_CAPTURE_ATTEMPTS - 1)
                  await sleep(CAMERA_CAPTURE_DELAY_MS);
              }
            }

            const camera_fallback = (() => {
              if (is_screen_tool) {
                return "Screen sharing was denied or unavailable. Please allow screen sharing when prompted.";
              }
              if (
                typeof window !== "undefined" &&
                "isSecureContext" in window &&
                !window.isSecureContext
              )
                return "I can't access the camera because this page isn't running in a secure context.";
              if (
                typeof navigator === "undefined" ||
                !navigator.mediaDevices?.getUserMedia
              )
                return "I can't access the camera in this browser.";
              return "I can't access the camera yet. Please allow camera permission.";
            })();

            const tool_response = await fetch("/api/realtime/tool", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tool_name,
                call_id,
                tool_arguments,
                ...(image_data_url
                  ? { image_data_url }
                  : { tool_output: camera_fallback }),
                previous_response_id:
                  typeof data?.response_id === "string"
                    ? data.response_id
                    : null,
                conversation_id:
                  typeof data?.conversation_id === "string"
                    ? data.conversation_id
                    : null,
                text: trimmed,
                history: current_history.slice(-MAX_CONVERSATION_MESSAGES),
                profile_id: current_profile_id,
                message_seq: next_message_seq,
              }),
              signal: abort_controller.signal,
            });
            const tool_data = await tool_response
              .json()
              .catch(() => null);
            if (!tool_response.ok)
              throw new Error(
                typeof tool_data?.error === "string"
                  ? tool_data.error
                  : "Tool execution failed"
              );
            if (response_request_id_ref.current !== request_id) return;

            apply_response({
              speech_text:
                typeof tool_data?.speech_text === "string"
                  ? tool_data.speech_text
                  : typeof tool_data?.response === "string"
                    ? tool_data.response
                    : "",
              history: tool_data?.history,
              ui_events: tool_data?.ui_events,
              response_id:
                typeof tool_data?.response_id === "string"
                  ? tool_data.response_id
                  : "",
              conversation_id:
                typeof tool_data?.conversation_id === "string"
                  ? tool_data.conversation_id
                  : "",
              used_web_search:
                typeof tool_data?.used_web_search === "boolean"
                  ? tool_data.used_web_search
                  : false,
            });
            return;
          }

          // No tool -- direct response
          apply_response({
            speech_text:
              typeof data?.speech_text === "string"
                ? data.speech_text
                : typeof data?.text === "string"
                  ? data.text
                  : "",
            history: data?.history,
            ui_events: data?.ui_events,
            response_id:
              typeof data?.response_id === "string"
                ? data.response_id
                : "",
            conversation_id:
              typeof data?.conversation_id === "string"
                ? data.conversation_id
                : "",
            used_web_search:
              typeof data?.used_web_search === "boolean"
                ? data.used_web_search
                : false,
          });
        };

        const streamed = await run_stream();
        if (!streamed) await run_non_stream();
      } catch (error) {
        if (abort_controller.signal.aborted) return;
        if (response_request_id_ref.current !== request_id) return;
        set_response_error(
          error instanceof Error
            ? error.message
            : "Failed to get a response"
        );
      } finally {
        if (response_abort_ref.current === abort_controller)
          response_abort_ref.current = null;
        if (response_request_id_ref.current === request_id)
          set_is_responding(false);
      }
    },
    [
      capture_camera_frame,
      capture_screen_frame,
      conversation,
      image_polling,
    ]
  );

  /* ---------------------------------------------------------------- */
  /*  Realtime event handler                                           */
  /* ---------------------------------------------------------------- */

  const handle_realtime_event = useCallback(
    (event: RealtimeTranscriptDelta) => {
      switch (event.type) {
        case "speech_started":
          is_speaking_ref.current = true;
          set_is_speaking(true);
          set_transcript("");
          cancel_tts();
          cancel_response();
          break;

        case "speech_stopped":
          is_speaking_ref.current = false;
          set_is_speaking(false);
          image_polling.flush_pending_ui_events();
          break;

        case "transcript_delta": {
          const delta_text = event.text;
          if (delta_text) {
            set_transcript((current) =>
              merge_transcript_delta({
                current: current || "",
                delta: delta_text,
              }).slice(-MAX_CONVERSATION_MESSAGE_CHARS)
            );
          }
          break;
        }

        case "transcript_done":
          if (event.text) {
            const trimmed_text = event.text.trim();
            if (!trimmed_text) break;

            const now_ms = Date.now();
            const prev = last_transcript_done_ref.current;
            if (
              prev &&
              prev.text === trimmed_text &&
              now_ms - prev.at_ms < 1000
            )
              break;
            last_transcript_done_ref.current = {
              text: trimmed_text,
              at_ms: now_ms,
            };

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
    [
      request_response,
      cancel_tts,
      cancel_response,
      image_polling,
    ]
  );

  /* ---------------------------------------------------------------- */
  /*  TTS debounce                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const trimmed = response_text.trim();
    if (!trimmed || last_spoken_text_ref.current === trimmed) return;

    const timer = setTimeout(() => {
      if (last_spoken_text_ref.current === trimmed) return;
      last_spoken_text_ref.current = trimmed;
      void request_tts({ text: trimmed });
    }, TTS_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [response_text, request_tts]);

  /* ---------------------------------------------------------------- */
  /*  Connection lifecycle                                             */
  /* ---------------------------------------------------------------- */

  const start_realtime = useCallback(async () => {
    if (is_connected) return;
    set_error_message(null);

    try {
      const client = new RealtimeTranscriptionClient();
      const connect_timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Connection timeout after 30s")),
          CONNECTION_TIMEOUT_MS
        )
      );

      await Promise.race([
        client.connect(handle_realtime_event),
        connect_timeout,
      ]);

      const saved_device_id = (() => {
        if (typeof window === "undefined") return null;
        try {
          const raw = window.localStorage.getItem("ambit_selected_mic_id");
          return typeof raw === "string" ? raw.trim() || null : null;
        } catch {
          // localStorage may be unavailable in SSR or private browsing
          return null;
        }
      })();

      const desired_device_id =
        mic_voice.selected_mic_id_ref.current ?? saved_device_id;

      await (async () => {
        if (!desired_device_id) return client.start_audio_stream();
        try {
          return await client.start_audio_stream({
            device_id: desired_device_id,
          });
        } catch {
          // Preferred mic device unavailable; fall back to system default
          console.warn("[Realtime] Preferred mic device unavailable, falling back to default");
          return client.start_audio_stream();
        }
      })();

      client_ref.current = client;
      set_is_connected(true);
    } catch (error) {
      set_error_message(
        error instanceof Error
          ? error.message
          : "Failed to start realtime transcription"
      );
    }
  }, [is_connected, handle_realtime_event, mic_voice.selected_mic_id_ref]);

  const stop_realtime = useCallback(() => {
    const client = client_ref.current;
    if (!client) return;
    client.disconnect();
    client_ref.current = null;
    set_is_connected(false);
    is_speaking_ref.current = false;
    set_is_speaking(false);
    cancel_tts();
    cancel_response();
  }, [cancel_tts, cancel_response]);

  /* ---------------------------------------------------------------- */
  /*  Reset helpers                                                    */
  /* ---------------------------------------------------------------- */

  const reset_conversation = useCallback(() => {
    cancel_response();
    set_transcript("");
    set_response_text("");
    image_polling.set_ui_events([]);
    set_error_message(null);
    set_response_error(null);
    is_speaking_ref.current = false;
    set_is_speaking(false);
    last_spoken_text_ref.current = "";
    cancel_tts();
    conversation.reset_conversation();
  }, [cancel_tts, cancel_response, conversation, image_polling]);

  /* ---------------------------------------------------------------- */
  /*  Public API                                                       */
  /* ---------------------------------------------------------------- */

  return {
    error_message,
    is_connected,
    is_loading_mics: mic_voice.is_loading_mics,
    is_loading_voices: mic_voice.is_loading_voices,
    is_speaking,
    is_responding,
    is_generating_tts,
    is_tts_playing,
    load_mics: mic_voice.load_mics,
    load_voices: mic_voice.load_voices,
    mic_devices: mic_voice.mic_devices,
    cancel_inflight,
    reset_conversation,
    response_error,
    response_text,
    used_web_search,
    ui_events: image_polling.ui_events,
    select_voice: mic_voice.select_voice,
    select_mic: mic_voice.select_mic,
    selected_mic_id: mic_voice.selected_mic_id,
    selected_voice_id: mic_voice.selected_voice_id,
    start_realtime,
    stop_realtime,
    transcript,
    tts_audio_element,
    voice_error: mic_voice.voice_error,
    voice_options: mic_voice.voice_options,
    word_alignment,
    tts_text,
  };
};
