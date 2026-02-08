import { NextRequest } from "next/server";
import {
  get_elevenlabs_api_key,
  get_elevenlabs_model_id,
  get_optional_elevenlabs_voice_id,
} from "@/lib/elevenlabs/elevenlabs_env";
import { strip_elevenlabs_v3_audio_tags } from "@/lib/elevenlabs/elevenlabs_audio_tags";
import { bad_request, internal_error, error_response } from "@/lib/api/error_response";
import { to_string } from "@/lib/api/validate_request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEVENLABS_TTS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Load env-derived config (refreshed on each call to avoid stale values)
const get_cached_elevenlabs_config = () => {
  return {
    api_key: get_elevenlabs_api_key(),
    default_voice_id: get_optional_elevenlabs_voice_id(), // Use optional version - client sends voice_id
    default_model_id: get_elevenlabs_model_id(),
  };
};

const parse_request_text = async (
  request: NextRequest
): Promise<{ text: string | null; voice_id: string | null; quality_mode: string | null; optimize_latency: number | null }> => {
  try {
    const data = (await request.json()) as { text?: string; voice_id?: string; quality_mode?: string; optimize_latency?: number } | null;
    const text = to_string(data?.text);
    const voice_id = to_string(data?.voice_id);
    const quality_mode = to_string(data?.quality_mode);
    const optimize_latency =
      typeof data?.optimize_latency === "number" ? data.optimize_latency : null;
    return { text: text || null, voice_id: voice_id || null, quality_mode: quality_mode || null, optimize_latency };
  } catch (error) {
    console.warn("[TTS] Failed to parse request body:", error);
    return { text: null, voice_id: null, quality_mode: null, optimize_latency: null };
  }
};

export async function POST(request: NextRequest): Promise<Response> {
  const { text, voice_id, quality_mode, optimize_latency } = await parse_request_text(request);

  if (!text) {
    return bad_request("Text is required.");
  }

  if (text.length > 5000) {
    return bad_request("Text too long");
  }

  const tts_start = Date.now();
  console.log(`\n[TTS API] ====== NEW TTS REQUEST ======`);
  console.log(`[TTS API] Text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
  console.log(`[TTS API] Quality mode: ${quality_mode || 'quality'}, Optimize latency: ${optimize_latency ?? 'default'}`);

  try {
    const config = get_cached_elevenlabs_config();
    const selected_voice_id = voice_id || config.default_voice_id;
    
    if (!selected_voice_id) {
      throw new Error("ELEVENLABS_VOICE_ID is not set and no voice_id provided in request");
    }
    
    // Determine model and text based on quality mode
    const is_fast_mode = quality_mode === "fast";
    const model_id = is_fast_mode ? "eleven_flash_v2_5" : (config.default_model_id || "eleven_multilingual_v2");
    
    console.log(`[TTS API] Using model: ${model_id}`);
    
    // For timestamps endpoint: always strip audio tags to get clean word boundaries
    // (The tags control voice delivery but we don't want them in the alignment)
    const text_for_alignment = strip_elevenlabs_v3_audio_tags(text);
    
    console.log(`[TTS API] Sending request to ElevenLabs...`);
    
    // Build request body with optional latency optimizations
    const request_body: Record<string, unknown> = {
      text: text_for_alignment,
      model_id,
    };

    // Add latency optimization if specified (1-4 for different levels)
    if (optimize_latency !== null && optimize_latency >= 0 && optimize_latency <= 4) {
      request_body.optimize_streaming_latency = optimize_latency;
    }
    
    // Use stream/with-timestamps endpoint for word highlighting
    const response = await fetch(
      `${ELEVENLABS_TTS_BASE_URL}/${selected_voice_id}/stream/with-timestamps`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "xi-api-key": config.api_key || "",
        },
        body: JSON.stringify(request_body),
      }
    );

    const tts_duration = Date.now() - tts_start;
    console.log(`[TTS API] Received response from ElevenLabs in ${tts_duration}ms`);

    if (!response.ok) {
      const error_text = await response.text();
      console.error(`[TTS API] ElevenLabs error: ${error_text}`);
      return error_response(`ElevenLabs TTS failed: ${error_text}`, response.status);
    }

    console.log(`[TTS API] Streaming response back to client`);
    console.log(`[TTS API] ====== TTS REQUEST COMPLETE ======\n`);

    // Return the streaming JSON response with audio + alignment data
    return new Response(response.body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Failed to generate audio.";
    return internal_error(error_message);
  }
}
