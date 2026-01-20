import { NextRequest } from "next/server";
import {
  get_elevenlabs_api_key,
  get_elevenlabs_model_id,
  get_elevenlabs_voice_id,
} from "@/lib/elevenlabs/elevenlabs_env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parse_request_text = async (
  request: NextRequest
): Promise<{ text: string | null; voice_id: string | null }> => {
  try {
    const data = (await request.json()) as { text?: string; voice_id?: string } | null;
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    const voice_id =
      typeof data?.voice_id === "string" ? data.voice_id.trim() : "";
    return { text: text || null, voice_id: voice_id || null };
  } catch {
    return { text: null, voice_id: null };
  }
};

export async function POST(request: NextRequest): Promise<Response> {
  const { text, voice_id } = await parse_request_text(request);

  if (!text) {
    return new Response(JSON.stringify({ error: "Text is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const api_key = get_elevenlabs_api_key();
    const selected_voice_id = voice_id || get_elevenlabs_voice_id();
    const model_id = get_elevenlabs_model_id();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selected_voice_id}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": api_key,
        },
        body: JSON.stringify({
          text,
          model_id,
        }),
      }
    );

    if (!response.ok) {
      const error_text = await response.text();
      return new Response(JSON.stringify({ error: `ElevenLabs TTS failed: ${error_text}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const content_type = response.headers.get("content-type") ?? "audio/mpeg";
    return new Response(response.body, {
      status: 200,
      headers: { "Content-Type": content_type },
    });
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Failed to generate audio.";
    return new Response(JSON.stringify({ error: error_message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
