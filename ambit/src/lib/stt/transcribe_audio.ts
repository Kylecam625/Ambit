import { DEFAULT_STT_MODEL } from "@/lib/constants/models";
import { build_openai_headers, OPENAI_BASE_URL } from "@/lib/openai/openai_client";
import type { stt_response } from "@/lib/stt/stt_types";

export const transcribe_audio = async ({
  audio_file,
  model = DEFAULT_STT_MODEL,
  language = "en",
}: {
  audio_file: File;
  model?: string;
  /** BCP-47 language hint – improves accuracy & latency. */
  language?: string;
}): Promise<stt_response> => {
  const form_data = new FormData();
  form_data.append("file", audio_file, audio_file.name || "recording.webm");
  form_data.append("model", model);
  form_data.append("language", language);

  const start = Date.now();
  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: build_openai_headers(),
    body: form_data,
  });
  const duration_ms = Date.now() - start;
  console.log(`[OpenAI] audio.transcriptions model=${model} duration_ms=${duration_ms}`);

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(error_text || "OpenAI transcription failed.");
  }

  const data = (await response.json()) as { text?: string };

  return {
    text: data.text ?? "",
  };
};
