import {
  get_elevenlabs_api_key,
  get_optional_elevenlabs_voice_id,
} from "@/lib/elevenlabs/elevenlabs_env";
import { error_response, internal_error } from "@/lib/api/error_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type voice_response = {
  voice_id: string;
  name: string;
  preview_url: string | null;
  labels?: Record<string, string>;
};

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalize_string = (value: unknown): string =>
  typeof value === "string" ? value : "";

const normalize_optional_string = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
};

const normalize_labels = (value: unknown): Record<string, string> | undefined => {
  if (!is_record(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(([, label_value]) => {
    return typeof label_value === "string";
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
};

const normalize_voices = (data: unknown): voice_response[] => {
  if (!is_record(data)) {
    return [];
  }

  const voices = data["voices"];

  if (!Array.isArray(voices)) {
    return [];
  }

  return voices
    .map((voice: unknown): voice_response | null => {
      if (!is_record(voice)) {
        return null;
      }

      const voice_id = normalize_string(voice["voice_id"]);

      if (!voice_id) {
        return null;
      }

      const name = normalize_string(voice["name"]) || "Unknown";

      return {
        voice_id,
        name,
        preview_url: normalize_optional_string(voice["preview_url"]),
        labels: normalize_labels(voice["labels"]),
      };
    })
    .filter((voice): voice is voice_response => Boolean(voice));
};

export async function GET(): Promise<Response> {
  try {
    const api_key = get_elevenlabs_api_key();
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": api_key },
    });

    if (!response.ok) {
      const error_text = await response.text();
      return error_response(
        `ElevenLabs voices failed: ${error_text}`,
        response.status
      );
    }

    const data = await response.json().catch(() => null);
    const voices = normalize_voices(data);
    const default_voice_id = get_optional_elevenlabs_voice_id();

    return Response.json(
      { voices, default_voice_id },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=600",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load voices.";
    console.error("[Voices] Error fetching ElevenLabs voices:", message);
    return internal_error(message);
  }
}
