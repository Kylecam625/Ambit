import { get_openai_api_key } from "@/lib/openai/openai_client";
import { build_realtime_transcription_session } from "@/lib/realtime/realtime_session_config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const api_key = get_openai_api_key();
    const session_config = { session: build_realtime_transcription_session() };

    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(session_config),
      }
    );

    if (!response.ok) {
      const error_text = await response.text();
      return new Response(
        JSON.stringify({ error: `Token generation failed: ${error_text}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Realtime token response:", JSON.stringify(data, null, 2));
    return Response.json(data);
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: error_message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
