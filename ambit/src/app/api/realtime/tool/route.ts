import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { analyze_camera_frame } from "@/lib/openai/ambit_camera_analysis";
import { get_openai_client } from "@/lib/openai/openai_client";
import { MAX_CONVERSATION_MESSAGES } from "@/lib/openai/openai_constants";
import { sanitize_history } from "@/lib/openai/openai_schemas";
import { continue_openai_response_with_tool_output } from "@/lib/openai/openai_responses";
import { is_record } from "@/lib/openai/openai_responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type request_body = {
  tool_name?: string;
  call_id?: string;
  image_data_url?: string;
  tool_output?: string;
  tool_arguments?: unknown;
  previous_response_id?: string | null;
  conversation_id?: string | null;
  text?: string;
  history?: unknown;
  profile_id?: string | null;
  message_seq?: number;
};

const to_string = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const to_int = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

export async function POST(request: NextRequest): Promise<Response> {
  let body: request_body | null = null;

  try {
    body = (await request.json()) as request_body | null;
  } catch {
    body = null;
  }

  const tool_name = to_string(body?.tool_name);
  const call_id = to_string(body?.call_id);
  const image_data_url = to_string(body?.image_data_url);
  const tool_output = to_string(body?.tool_output);
  const previous_response_id =
    typeof body?.previous_response_id === "string" ? body.previous_response_id.trim() : null;
  const conversation_id =
    typeof body?.conversation_id === "string" ? body.conversation_id.trim() : null;
  const text = to_string(body?.text);
  const history = sanitize_history(body?.history);
  const profile_id = typeof body?.profile_id === "string" ? body.profile_id.trim() : null;
  const message_seq = to_int(body?.message_seq);

  if (!tool_name) {
    return new Response(JSON.stringify({ error: "tool_name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (tool_name !== "analyze_camera_frame") {
    return new Response(JSON.stringify({ error: `Unsupported tool: ${tool_name}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!call_id) {
    return new Response(JSON.stringify({ error: "call_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const has_image = Boolean(image_data_url);
  const has_tool_output = Boolean(tool_output);

  if (!has_image && !has_tool_output) {
    return new Response(JSON.stringify({ error: "image_data_url or tool_output is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tool_arguments = is_record(body?.tool_arguments) ? body?.tool_arguments : null;
  const tool_question = to_string(tool_arguments?.["question"]) || text;
  const tool_focus = to_string(tool_arguments?.["focus"]) || null;

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

    const vision_text = has_tool_output
      ? tool_output
      : await analyze_camera_frame({
          openai,
          question: tool_question,
          focus: tool_focus,
          image_data_url,
        });

    const result = await continue_openai_response_with_tool_output({
      openai,
      previous_response_id,
      conversation_id,
      call_id,
      tool_output: vision_text || "No clear visual signal was detected.",
      extra_instructions,
    });

    if (result.kind === "tool_request") {
      return Response.json({
        tool_request: result.tool_request,
        history: history.slice(-MAX_CONVERSATION_MESSAGES),
        response_id: result.response_id,
        conversation_id: result.conversation_id,
      });
    }

    const updated_history = [
      ...history,
      { role: "user" as const, content: text },
      { role: "assistant" as const, content: result.speech_text },
    ];

    const base_url = get_identity_service_url();
    maybe_start_background_memory_ingest({
      openai,
      base_url,
      profile_id,
      message_seq,
      updated_history,
      conversation_id: result.conversation_id || conversation_id || null,
    });

    return Response.json({
      speech_text: result.speech_text,
      history: updated_history.slice(-MAX_CONVERSATION_MESSAGES),
      response_id: result.response_id,
      conversation_id: result.conversation_id,
      ui_events: [],
    });
  } catch (error) {
    const error_message = error instanceof Error ? error.message : "Tool execution failed.";
    console.error("Realtime tool error:", error);
    return new Response(JSON.stringify({ error: error_message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

