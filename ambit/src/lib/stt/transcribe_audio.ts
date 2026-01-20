import { build_openai_headers, OPENAI_BASE_URL } from "@/lib/openai/openai_client";
import { STT_MODEL } from "@/lib/stt/stt_config";
import type { stt_response } from "@/lib/stt/stt_types";

export const transcribe_audio = async ({
  audio_file,
  model = STT_MODEL,
}: {
  audio_file: File;
  model?: string;
}): Promise<stt_response> => {
  const form_data = new FormData();
  form_data.append("file", audio_file, audio_file.name || "recording.webm");
  form_data.append("model", model);

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: build_openai_headers(),
    body: form_data,
  });

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(error_text || "OpenAI transcription failed.");
  }

  const data = (await response.json()) as { text?: string };

  return {
    text: data.text ?? "",
  };
};
