export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { get_openai_api_key } from "@/lib/openai/openai_client";

/**
 * POST /api/wake-word/check
 *
 * Accepts a short audio clip (WebM/Opus) and transcribes it with Whisper
 * to check for the "hey ambit" wake phrase.
 *
 * Cost: ~$0.006/minute of audio → a 2-second clip costs ~$0.0002.
 */
export async function POST(request: Request) {
  try {
    const form_data = await request.formData();
    const audio_file = form_data.get("audio");

    if (!audio_file || !(audio_file instanceof Blob)) {
      return Response.json(
        { error: "Missing audio file" },
        { status: 400 }
      );
    }

    const api_key = get_openai_api_key();

    // Build multipart form for OpenAI transcription API
    // Using gpt-4o-transcribe: much more accurate than whisper-1,
    // doesn't hallucinate on short/quiet clips, and understands the prompt better.
    const whisper_form = new FormData();
    const file_type = audio_file.type || "audio/wav";
    const file_ext = file_type.includes("wav") ? "wav" : "webm";
    whisper_form.append(
      "file",
      new File([audio_file], `wake.${file_ext}`, { type: file_type })
    );
    whisper_form.append("model", "gpt-4o-mini-transcribe");
    whisper_form.append("language", "en");
    whisper_form.append("response_format", "text");
    whisper_form.append(
      "prompt",
      "Ambit is a voice assistant. The user says: Hey Ambit"
    );

    const whisper_response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${api_key}` },
        body: whisper_form,
      }
    );

    if (!whisper_response.ok) {
      const error_text = await whisper_response.text().catch(() => "");
      console.error("[WakeWord API] Whisper error:", whisper_response.status, error_text);
      return Response.json(
        { error: "Transcription failed" },
        { status: 502 }
      );
    }

    // response_format=text returns plain text
    const transcript = (await whisper_response.text()).trim();

    return Response.json({ transcript });
  } catch (error) {
    console.error("[WakeWord API] Error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
