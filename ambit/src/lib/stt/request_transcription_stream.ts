import { build_audio_form_data } from "@/lib/audio/build_audio_form_data";

export interface TranscriptionStreamDelta {
  type: "delta" | "done" | "error";
  text?: string;
  full_text?: string;
  error?: string;
  code?: string;
}

export async function* request_transcription_stream(
  audio_blob: Blob
): AsyncGenerator<TranscriptionStreamDelta> {
  const form_data = build_audio_form_data({ audio_blob });

  const response = await fetch("/api/stt/stream", {
    method: "POST",
    body: form_data,
  });

  if (!response.ok) {
    const error_data = await response.json();
    throw new Error(error_data.error || "Transcription request failed");
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data_string = line.slice(6);
          if (data_string.trim()) {
            const delta: TranscriptionStreamDelta = JSON.parse(data_string);
            yield delta;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
