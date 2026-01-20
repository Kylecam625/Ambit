import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { identity_add_generated_image, identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import { generate_photo } from "@/lib/openai/ambit_image_generation";
import {
  continue_openai_response_with_tool_output,
  create_openai_response_with_tools,
} from "@/lib/openai/openai_responses";
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

    const result = await create_openai_response_with_tools({
      openai,
      text,
      history,
      previous_response_id,
      conversation_id,
      extra_instructions,
    });

    if (result.kind === "tool_request") {
      const tool_name = result.tool_request.name;

      if (tool_name === "analyze_camera_frame") {
        return Response.json({
          tool_request: result.tool_request,
          history: history.slice(-MAX_CONVERSATION_MESSAGES),
          response_id: result.response_id,
          conversation_id: result.conversation_id,
        });
      }

      if (tool_name === "generate_photo") {
        const prompt =
          typeof result.tool_request.arguments?.["prompt"] === "string"
            ? String(result.tool_request.arguments["prompt"]).trim()
            : "";
        const size =
          typeof result.tool_request.arguments?.["size"] === "string"
            ? (String(result.tool_request.arguments["size"]).trim() as
                | "1024x1024"
                | "1024x1536"
                | "1536x1024"
                | "auto")
            : undefined;
        const quality =
          typeof result.tool_request.arguments?.["quality"] === "string"
            ? (String(result.tool_request.arguments["quality"]).trim() as
                | "low"
                | "medium"
                | "high")
            : undefined;

        const generated = await generate_photo({
          openai,
          prompt,
          size,
          quality,
        });

        const base_url = get_identity_service_url();
        let did_save = false;

        if (profile_id) {
          try {
            await identity_add_generated_image({
              base_url,
              profile_id,
              prompt,
              image_data_url: generated.image_data_url,
            });
            did_save = true;
          } catch {
            did_save = false;
          }
        }

        const continued = await continue_openai_response_with_tool_output({
          openai,
          previous_response_id: result.response_id,
          conversation_id: result.conversation_id,
          call_id: result.tool_request.call_id,
          tool_output: {
            ok: true,
            prompt,
            size: size ?? "1024x1024",
            quality: quality ?? "high",
            image_saved_to_profile: did_save,
          },
          extra_instructions,
        });

        if (continued.kind === "tool_request") {
          return Response.json({
            tool_request: continued.tool_request,
            history: history.slice(-MAX_CONVERSATION_MESSAGES),
            response_id: continued.response_id,
            conversation_id: continued.conversation_id,
          });
        }

        const updated_history = [
          ...history,
          { role: "user" as const, content: text },
          { role: "assistant" as const, content: continued.speech_text },
        ];

        maybe_start_background_memory_ingest({
          openai,
          base_url,
          profile_id,
          message_seq,
          updated_history,
          conversation_id: continued.conversation_id || conversation_id || null,
        });

        return Response.json({
          speech_text: continued.speech_text,
          history: updated_history.slice(-MAX_CONVERSATION_MESSAGES),
          response_id: continued.response_id,
          conversation_id: continued.conversation_id,
          ui_events: [
            {
              type: "display_image",
              image_data_url: generated.image_data_url,
              display_ms: 5000,
            },
          ],
        });
      }

      return new Response(JSON.stringify({ error: `Unsupported tool request: ${tool_name}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const base_url = get_identity_service_url();
    console.log(
      `[API /respond] About to check memory ingest: message_seq=${message_seq}, profile_id=${profile_id}, history_length=${result.updated_history.length}`
    );

    maybe_start_background_memory_ingest({
      openai,
      base_url,
      profile_id,
      message_seq,
      updated_history: result.updated_history,
      conversation_id: result.conversation_id || conversation_id || null,
    });

    return Response.json({
      speech_text: result.speech_text,
      history: result.updated_history.slice(-MAX_CONVERSATION_MESSAGES),
      response_id: result.response_id,
      conversation_id: result.conversation_id,
      ui_events: result.ui_events ?? [],
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
