import type { stt_response } from "@/lib/stt/stt_types";

export const request_transcription = async ({
  form_data,
}: {
  form_data: FormData;
}): Promise<stt_response> => {
  const response = await fetch("/api/stt", {
    method: "POST",
    body: form_data,
  });

  if (!response.ok) {
    const error_text = await response.text();

    try {
      const parsed = JSON.parse(error_text) as { error?: string };

      if (parsed?.error) {
        throw new Error(parsed.error);
      }
    } catch {
      // Error response is not valid JSON; fall through to use raw error_text as message
    }

    throw new Error(error_text || "Transcription request failed.");
  }

  const data = (await response.json()) as stt_response;

  return {
    text: data.text ?? "",
  };
};
