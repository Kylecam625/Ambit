import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import { create_openai_response } from "@/lib/openai/openai_responses";
import { MAX_CONVERSATION_MESSAGES } from "@/lib/openai/openai_constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parse_respond_request(request);

  if (!parsed) {
    return new Response(JSON.stringify({ error: "Text is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { text, history, previous_response_id, conversation_id, profile_id, message_seq } = parsed;
  console.log(`[API /respond] Received request: message_seq=${message_seq}, profile_id=${profile_id}, text="${text.substring(0, 50)}..."`);


  try {
    const openai = get_openai_client();

    let extra_instructions: string | null = null;

    if (profile_id) {
      try {
        const base_url = get_identity_service_url();
        const bundle = await identity_get_profile({ base_url, profile_id });
        extra_instructions = build_identity_instructions({
          profile: bundle.profile,
          memory: bundle.memory,
          conversation_summaries: bundle.conversation_summaries,
        });
      } catch (error) {
        console.warn("Identity lookup failed; continuing as anonymous.", error);
      }
    }

    const {
      speech_text,
      updated_history,
      response_id,
      conversation_id: next_conversation_id,
    } = await create_openai_response({
      openai,
      text,
      history,
      previous_response_id,
      conversation_id,
      extra_instructions,
    });

    const base_url = get_identity_service_url();
    console.log(`[API /respond] About to check memory ingest: message_seq=${message_seq}, profile_id=${profile_id}, history_length=${updated_history.length}`);
    
    maybe_start_background_memory_ingest({
      openai,
      base_url,
      profile_id,
      message_seq,
      updated_history,
      conversation_id: next_conversation_id || conversation_id || null,
    });

    return Response.json({
      speech_text,
      history: updated_history.slice(-MAX_CONVERSATION_MESSAGES),
      response_id,
      conversation_id: next_conversation_id,
    });
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Failed to generate a response.";
    
    console.error("OpenAI Response Error:", error);

    return new Response(JSON.stringify({ error: error_message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
