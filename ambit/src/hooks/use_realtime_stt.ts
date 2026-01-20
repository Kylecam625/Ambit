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

const MAX_CONVERSATION_MESSAGES = 50;
const MAX_CONVERSATION_MESSAGE_CHARS = 2000;
const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

void MAX_CONVERSATION_MESSAGE_CHARS;

export const useRealtimeStt = ({
  profile_id = null,
}: {
  profile_id?: string | null;
} = {}) => {
  console.log(`[useRealtimeStt] Hook called with profile_id: ${profile_id}`);
  
  // Load profile-specific conversation state
  const initial_session = load_session_conversation_state(profile_id);
  console.log(`[useRealtimeStt] Loaded initial session:`, {
    profile_id,
    message_seq: initial_session.message_seq,
    conversation_history_length: initial_session.conversation_history.length,
    conversation_id: initial_session.conversation_id,
  });

  const client_ref = useRef<RealtimeTranscriptionClient | null>(null);
  const response_request_id_ref = useRef(0);
  const response_abort_ref = useRef<AbortController | null>(null);
  const last_spoken_text_ref = useRef("");
  const tts_request_id_ref = useRef(0);
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const audio_url_ref = useRef<string | null>(null);
  const profile_id_ref = useRef<string | null>(profile_id);
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
  const [is_tts_playing, set_is_tts_playing] = useState(false);
  const [is_loading_mics, set_is_loading_mics] = useState(false);
  const [mic_devices, set_mic_devices] = useState<mic_device[]>([]);
  const [selected_mic_id, set_selected_mic_id] = useState<string | null>(() => {
    // Load saved mic from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem("ambit_selected_mic_id");
    }
    return null;
  });
  const [media_stream, set_media_stream] = useState<MediaStream | null>(null);
  const [is_loading_voices, set_is_loading_voices] = useState(false);
  const [voice_options, set_voice_options] = useState<voice_option[]>([]);
  const [selected_voice_id, set_selected_voice_id] = useState<string | null>(() => {
    // Load saved voice from localStorage
    if (typeof window !== "undefined") {
      return localStorage.getItem("ambit_selected_voice_id");
    }
    return null;
  });
  const [voice_error, set_voice_error] = useState<string | null>(null);
  const [transcript, set_transcript] = useState("");
  const [response_text, set_response_text] = useState("");
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

  // Track the current profile_id to detect changes
  const current_profile_id_ref = useRef<string | null>(profile_id);

  // Keep profile_id_ref in sync with the prop
  useEffect(() => {
    profile_id_ref.current = profile_id;
  }, [profile_id]);

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

  // Debug: Log when message_seq state changes
  useEffect(() => {
    console.log(`[State] message_seq changed to: ${message_seq}`);
  }, [message_seq]);

  // CRITICAL: When profile changes, load that profile's conversation
  // Enforces Rule 12.1: "Isolated Histories: Each profile maintains separate conversation history"
  useEffect(() => {
    if (current_profile_id_ref.current === profile_id) {
      return; // No change
    }

    // Profile changed! Load the new profile's conversation state
    console.log(`[Memory Isolation] Profile changed from ${current_profile_id_ref.current} to ${profile_id}`);
    current_profile_id_ref.current = profile_id;

    const new_session = load_session_conversation_state(profile_id);
    console.log(`[Memory Isolation] Loaded new session:`, {
      profile_id,
      message_seq: new_session.message_seq,
      conversation_history_length: new_session.conversation_history.length,
    });
    
    // Keep realtime event handler state fresh immediately (avoid stale closures)
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

  // Persist conversation state with profile_id for isolation
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      console.log(`[Persist] Saving conversation state:`, {
        profile_id,
        message_seq,
        conversation_history_length: conversation_history.length,
        conversation_id,
      });
      
      persist_session_conversation_state({
        conversation_history,
        previous_response_id,
        conversation_id,
        message_seq,
        profile_id,  // Include profile_id for isolated storage
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
    set_is_tts_playing(false);
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

  const request_tts = useCallback(
    async ({ text }: { text: string }) => {
      const trimmed = text.trim();

      if (!trimmed) {
        return;
      }

      const request_id = tts_request_id_ref.current + 1;
      tts_request_id_ref.current = request_id;
      stop_audio();

      try {
        const response = await fetch("/api/realtime/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            voice_id: selected_voice_id,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const message =
            typeof data?.error === "string" ? data.error : "Failed to generate audio";
          throw new Error(message);
        }

        if (tts_request_id_ref.current !== request_id) {
          return;
        }

        const audio_blob = await response.blob();

        if (tts_request_id_ref.current !== request_id) {
          return;
        }

        const url = URL.createObjectURL(audio_blob);
        audio_url_ref.current = url;
        const audio = audio_ref.current ?? new Audio();
        audio_ref.current = audio;
        set_tts_audio_element(audio);
        audio.src = url;
        audio.onplay = () => set_is_tts_playing(true);
        audio.onpause = () => set_is_tts_playing(false);
        audio.onerror = () => set_is_tts_playing(false);
        audio.onended = () => {
          set_is_tts_playing(false);
          if (audio_url_ref.current === url) {
            URL.revokeObjectURL(url);
            audio_url_ref.current = null;
          }
        };
        
        // Add small delay to ensure audio is ready
        await new Promise(resolve => setTimeout(resolve, 50));
        await audio.play().catch((err) => {
          console.error("Failed to play audio:", err);
          set_is_tts_playing(false);
        });
      } catch (error) {
        if (tts_request_id_ref.current !== request_id) {
          return;
        }
        console.error("Failed to play TTS audio:", error);
      }
    },
    [stop_audio, selected_voice_id]
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
      } catch (error) {
        console.warn("Microphone permission not granted yet.", error);
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
    } catch (error) {
      console.error("Failed to load microphones.", error);
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

      const request_id = response_request_id_ref.current + 1;
      response_request_id_ref.current = request_id;
      set_is_responding(true);
      set_response_error(null);
      set_response_text("");
      last_spoken_text_ref.current = "";
      response_abort_ref.current?.abort();
      const abort_controller = new AbortController();
      response_abort_ref.current = abort_controller;

      try {
        const current_message_seq = message_seq_ref.current;
        const next_message_seq = current_message_seq + 2;
        const current_profile_id = profile_id_ref.current;
        const current_history = conversation_history_ref.current;
        const current_conversation_id = conversation_id_ref.current;
        const current_previous_response_id = previous_response_id_ref.current;
        
        console.log(`[Client] send_response called with:`, {
          message_seq: current_message_seq,
          next_message_seq,
          profile_id_from_ref: current_profile_id,
          conversation_history_length: current_history.length,
        });
        
        const body: Record<string, unknown> = {
          text: trimmed,
          history: current_history.slice(-MAX_CONVERSATION_MESSAGES),
          message_seq: next_message_seq,
        };

        if (current_profile_id) {
          body["profile_id"] = current_profile_id;
          console.log(`[Client] ✓ Added profile_id to request body: ${current_profile_id}`);
        } else {
          console.log(`[Client] ⚠ No profile_id to add (current_profile_id is ${current_profile_id})`);
        }
        
        if (current_conversation_id) {
          body["conversation_id"] = current_conversation_id;
        } else if (current_previous_response_id) {
          body["previous_response_id"] = current_previous_response_id;
        }

        const response = await fetch("/api/realtime/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: abort_controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            typeof data?.error === "string" ? data.error : "Failed to get a response";
          throw new Error(message);
        }

        if (response_request_id_ref.current !== request_id) {
          return;
        }

        const next_response =
          typeof data?.speech_text === "string"
            ? data.speech_text
            : typeof data?.response === "string"
              ? data.response
              : "";
        const updated_history = Array.isArray(data?.history) ? data.history : [];
        const response_id = typeof data?.response_id === "string" ? data.response_id : "";
        const next_conversation_id =
          typeof data?.conversation_id === "string" ? data.conversation_id : "";

        set_response_text(next_response);
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

        console.log(
          `[Client] ✓ Response successful! Updating message_seq: ${current_message_seq} → ${next_message_seq}`
        );
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
    []
  );

  const handle_realtime_event = useCallback(
    (event: RealtimeTranscriptDelta) => {
      switch (event.type) {
        case "speech_started":
          // VAD detected user started speaking → barge-in
          console.log("[VAD] Speech started - triggering barge-in");
          is_speaking_ref.current = true;
          set_is_speaking(true);
          set_transcript("");
          cancel_tts();
          cancel_response();
          break;

        case "speech_stopped":
          // VAD detected user stopped speaking
          console.log("[VAD] Speech stopped");
          is_speaking_ref.current = false;
          set_is_speaking(false);
          break;

        case "transcript_delta":
          // Live transcription text (display only)
          if (event.text) {
            set_transcript((current) => {
              const next = `${current || ""}${event.text}`;
              return next.slice(-MAX_CONVERSATION_MESSAGE_CHARS);
            });
          }
          break;

        case "transcript_done":
          // Final transcript ready → send to AI
          if (event.text) {
            set_transcript(event.text);
            void request_response({ text: event.text });
          }
          break;

        case "error":
          is_speaking_ref.current = false;
          set_is_speaking(false);
          set_error_message(event.error || "Realtime transcription error");
          break;
      }
    },
    [request_response, cancel_tts, cancel_response]
  );

  useEffect(() => {
    const trimmed = response_text.trim();

    if (!trimmed) {
      return;
    }

    if (last_spoken_text_ref.current === trimmed) {
      return;
    }

    last_spoken_text_ref.current = trimmed;
    void request_tts({ text: trimmed });
  }, [response_text, request_tts]);

  const start_realtime = useCallback(async () => {
    if (is_connected) {
      return;
    }

    set_error_message(null);

    try {
      const client = new RealtimeTranscriptionClient();
      await client.connect(handle_realtime_event);
      const stream = await client.start_audio_stream({
        device_id: selected_mic_id || undefined,
      });
      set_media_stream(stream);

      client_ref.current = client;
      set_is_connected(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start realtime transcription";
      set_error_message(message);
    }
  }, [is_connected, handle_realtime_event, selected_mic_id]);

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
        // Clear the current profile's conversation state
        clear_session_conversation_state(profile_id);
      } catch {
        // ignore
      }
    }
  }, [cancel_tts, cancel_response, profile_id]);

  return {
    error_message,
    is_connected,
    is_loading_mics,
    is_loading_voices,
    is_speaking,
    is_responding,
    is_tts_playing,
    load_mics,
    load_voices,
    media_stream,
    mic_devices,
    reset_transcript,
    reset_conversation,
    response_error,
    response_text,
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
  };
};
