import { useCallback, useRef, useState } from "react";

import { create_mic_recorder, mic_recorder } from "@/lib/audio/record_from_mic";
import { normalize_stt_error } from "@/lib/stt/stt_errors";
import { request_transcription_stream } from "@/lib/stt/request_transcription_stream";

export const useStt = () => {
  const recorder_ref = useRef<mic_recorder | null>(null);
  const [is_recording, set_is_recording] = useState(false);
  const [is_transcribing, set_is_transcribing] = useState(false);
  const [transcript, set_transcript] = useState("");
  const [error_message, set_error_message] = useState<string | null>(null);

  const start_recording = useCallback(async () => {
    if (is_recording || is_transcribing) {
      return;
    }

    set_error_message(null);

    try {
      const recorder = await create_mic_recorder();
      recorder_ref.current = recorder;
      recorder.start();
      set_is_recording(true);
    } catch (error) {
      set_error_message(normalize_stt_error({ error }));
    }
  }, [is_recording, is_transcribing]);

  const stop_recording = useCallback(async () => {
    const recorder = recorder_ref.current;

    if (!recorder || is_transcribing) {
      return;
    }

    set_is_recording(false);
    set_is_transcribing(true);

    try {
      const audio_blob = await recorder.stop();
      recorder.cleanup();
      recorder_ref.current = null;

      let accumulated_text = "";

      for await (const delta of request_transcription_stream(audio_blob)) {
        if (delta.type === "delta" && delta.text) {
          accumulated_text += delta.text;
          set_transcript(accumulated_text);
        } else if (delta.type === "done" && delta.full_text) {
          set_transcript(delta.full_text);
        } else if (delta.type === "error") {
          throw new Error(delta.error || "Transcription stream error");
        }
      }
    } catch (error) {
      set_error_message(normalize_stt_error({ error }));
    } finally {
      set_is_transcribing(false);
    }
  }, [is_transcribing]);

  const reset_transcript = useCallback(() => {
    set_transcript("");
    set_error_message(null);
  }, []);

  return {
    error_message,
    is_recording,
    is_transcribing,
    reset_transcript,
    start_recording,
    stop_recording,
    transcript,
  };
};
