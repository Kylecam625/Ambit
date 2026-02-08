import { get_openai_client } from "@/lib/openai/openai_client";
import { TranscriptionConfig } from "./stt_config";
import { TranscriptionError } from "./stt_errors";

export interface StreamDelta {
  type: "delta" | "done";
  text?: string;
  full_text?: string;
}

export async function* transcribe_audio_stream(
  audio_blob: Blob,
  config: TranscriptionConfig
): AsyncGenerator<StreamDelta> {
  const openai = get_openai_client();
  const start = Date.now();
  let first_delta_at = 0;

  try {
    const file_to_upload = new File([audio_blob], "audio.webm", {
      type: audio_blob.type,
    });

    const stream = await openai.audio.transcriptions.create({
      file: file_to_upload,
      model: config.model,
      response_format: config.response_format as "text",
      language: config.language ?? "en",
      stream: true,
    });

    let accumulated_text = "";

    for await (const chunk of stream) {
      if (chunk.type === "transcript.text.delta") {
        accumulated_text += chunk.delta;
        if (!first_delta_at) {
          first_delta_at = Date.now();
          console.log(
            `[OpenAI] audio.transcriptions.stream first_delta_ms=${first_delta_at - start}`
          );
        }
        yield { type: "delta", text: chunk.delta };
        continue;
      }

      if (chunk.type === "transcript.text.segment") {
        accumulated_text += chunk.text;
        if (!first_delta_at) {
          first_delta_at = Date.now();
          console.log(
            `[OpenAI] audio.transcriptions.stream first_delta_ms=${first_delta_at - start}`
          );
        }
        yield { type: "delta", text: chunk.text };
        continue;
      }

      if (chunk.type === "transcript.text.done") {
        accumulated_text = chunk.text;
        const duration_ms = Date.now() - start;
        console.log(
          `[OpenAI] audio.transcriptions.stream done duration_ms=${duration_ms}`
        );
        yield { type: "done", full_text: accumulated_text };
        return;
      }
    }

    const duration_ms = Date.now() - start;
    console.log(`[OpenAI] audio.transcriptions.stream done duration_ms=${duration_ms}`);
    yield {
      type: "done",
      full_text: accumulated_text,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new TranscriptionError(
        `Stream transcription failed: ${error.message}`,
        "TRANSCRIPTION_FAILED"
      );
    }
    throw new TranscriptionError(
      "Unknown stream transcription error",
      "TRANSCRIPTION_FAILED"
    );
  }
}
