import { get_openai_api_key } from "@/lib/openai/openai_client";
import { build_realtime_transcription_session } from "@/lib/realtime/realtime_session_config";
import { error_response, internal_error } from "@/lib/api/error_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST() {
  try {
    const api_key = get_openai_api_key();
    const session_config = { session: build_realtime_transcription_session() };

    const response = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
      body: JSON.stringify(session_config),
      keepalive: true,
    });

    if (!response.ok) {
      const error_text = await response.text();
      return error_response(
        `Token generation failed: ${error_text}`,
        response.status
      );
    }

    const data = await response.json();
    console.log("[Token] Client secret generated successfully");
    return Response.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Token] Error generating client secret:", message);
    return internal_error(message);
  }
}
