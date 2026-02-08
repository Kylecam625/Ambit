import { NextRequest } from "next/server";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { analyze_camera_frame } from "@/lib/openai/ambit_camera_analysis";
import { analyze_screen } from "@/lib/openai/ambit_screen_analysis";
import { get_openai_client } from "@/lib/openai/openai_client";
import { MAX_CONVERSATION_MESSAGES } from "@/lib/openai/openai_constants";
import { sanitize_history } from "@/lib/openai/openai_schemas";
import { continue_openai_response_with_tool_output } from "@/lib/openai/openai_responses";
import { bad_request, internal_error } from "@/lib/api/error_response";
import { to_string, to_int, is_record } from "@/lib/api/validate_request";
import { fetch_identity_context } from "@/lib/api/fetch_identity_context";

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

export async function POST(request: NextRequest): Promise<Response> {
  let body: request_body | null = null;

  try {
    body = (await request.json()) as request_body | null;
  } catch (error) {
    console.warn("[Tool] Failed to parse request body:", error);
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
    return bad_request("tool_name is required");
  }

  if (tool_name !== "analyze_camera_frame" && tool_name !== "analyze_screen") {
    return bad_request(`Unsupported tool: ${tool_name}`);
  }

  if (!call_id) {
    return bad_request("call_id is required");
  }

  const has_image = Boolean(image_data_url);
  const has_tool_output = Boolean(tool_output);

  if (!has_image && !has_tool_output) {
    return bad_request("image_data_url or tool_output is required");
  }

  if (!text) {
    return bad_request("text is required");
  }

  const tool_arguments = is_record(body?.tool_arguments) ? body?.tool_arguments : null;
  const tool_question = to_string(tool_arguments?.["question"]) || text;
  const tool_focus = to_string(tool_arguments?.["focus"]) || null;

  try {
    const openai = get_openai_client();

    const { identity_instructions } = await fetch_identity_context(profile_id);
    const extra_instructions = identity_instructions || null;

    const vision_text = has_tool_output
      ? tool_output
      : tool_name === "analyze_screen"
        ? await analyze_screen({
            openai,
            question: tool_question,
            focus: tool_focus,
            image_data_url,
          })
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
    return internal_error(error_message);
  }
}

