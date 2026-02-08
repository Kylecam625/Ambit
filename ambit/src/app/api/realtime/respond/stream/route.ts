import { NextRequest } from "next/server";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import { select_ambit_tools } from "@/lib/openai/ambit_tools";
import { should_enable_web_search } from "@/lib/openai/web_search_detector";
import { build_instructions, trim_history_messages } from "@/lib/openai/openai_responses";
import { get_openai_responses_model } from "@/lib/openai/openai_client";
import { MAX_CONVERSATION_MESSAGE_CHARS, MAX_OUTPUT_TOKENS } from "@/lib/openai/openai_constants";
import { bad_request } from "@/lib/api/error_response";
import { is_record } from "@/lib/api/validate_request";
import { fetch_identity_context } from "@/lib/api/fetch_identity_context";
import { STREAM_TIMEOUT_MS } from "@/lib/constants/timeouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parse_respond_request(request);

  if (!parsed) {
    return bad_request("Text is required.");
  }

  const { text, history, profile_id, message_seq, detected_emotion } = parsed;
  const request_start = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const openai = get_openai_client();

        const { identity_instructions } = await fetch_identity_context(profile_id);
        let extra_instructions: string | null = identity_instructions || null;

        // Inject detected facial emotion as context
        if (detected_emotion && detected_emotion !== "neutral") {
          const emotion_note = `FACIAL EXPRESSION (PRIVATE): The user's face currently looks ${detected_emotion}. Be subtly perceptive about this if relevant.`;
          extra_instructions = extra_instructions ? `${extra_instructions}\n\n${emotion_note}` : emotion_note;
        }

        const enable_web_search = should_enable_web_search(text);

        const input_with_history: ConversationMessage[] = [
          ...trim_history_messages(history),
          { role: "user", content: text },
        ];

        const instructions = build_instructions({ extra_instructions });
        const tools = select_ambit_tools({ text, enable_web_search });

        const payload: Record<string, unknown> = {
          model: get_openai_responses_model(),
          instructions,
          input: input_with_history,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
        };

        if (tools.length > 0) {
          payload["tools"] = tools;
          payload["tool_choice"] = "auto";
          payload["parallel_tool_calls"] = false;
        }

        const openai_obj: unknown = openai;
        if (!is_record(openai_obj)) throw new Error("OpenAI client is not a valid object.");
        const responses = openai_obj["responses"];
        if (!is_record(responses)) throw new Error("OpenAI client is missing responses API.");
        const create = responses["create"];
        if (typeof create !== "function") throw new Error("OpenAI client is missing responses.create().");

        const stream_start = Date.now();
        const response_stream = await (create as (...args: unknown[]) => Promise<unknown>).call(
          responses,
          payload
        );

        let accumulated_text = "";
        let response_id = "";
        let has_tool_call = false;
        let first_delta_logged = false;

        // Simple timeout: set once, reset on every received event.
        // Avoids creating a new Promise.race + setTimeout per event.
        let timeout_handle: ReturnType<typeof setTimeout> | undefined;
        let timed_out = false;

        const reset_timeout = () => {
          if (timeout_handle !== undefined) clearTimeout(timeout_handle);
          timeout_handle = setTimeout(() => {
            timed_out = true;
          }, STREAM_TIMEOUT_MS);
        };

        reset_timeout();

        for await (const event of response_stream as AsyncIterable<unknown>) {
          if (timed_out) break;
          reset_timeout();

          if (!is_record(event)) continue;
          const event_type = event["type"];

          if (event_type === "response.output_text.delta") {
            const delta = event["delta"];
            if (typeof delta === "string") {
              accumulated_text += delta;
              if (!first_delta_logged) {
                first_delta_logged = true;
                console.log(`[Stream] First delta in ${Date.now() - stream_start}ms`);
              }
              const data = JSON.stringify({ type: "text_delta", delta, accumulated: accumulated_text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }

          if (event_type === "response.created") {
            const response_obj = event["response"];
            if (is_record(response_obj) && typeof response_obj["id"] === "string") {
              response_id = response_obj["id"];
            }
          }

          if (event_type === "response.output_item.added") {
            const item = event["item"];
            if (is_record(item) && item["type"] === "function_call") {
              has_tool_call = true;
            }
          }

          if (event_type === "response.function_call_arguments.done") {
            has_tool_call = true;
          }

          if (event_type === "response.done" || event_type === "response.completed") {
            break;
          }
        }

        if (timeout_handle !== undefined) clearTimeout(timeout_handle);

        if (timed_out) {
          console.error(`[Stream] Timed out after ${STREAM_TIMEOUT_MS}ms`);
          const data = JSON.stringify({ type: "error", error: "Stream timed out" });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
          return;
        }

        if (has_tool_call) {
          const data = JSON.stringify({
            type: "requires_tool",
            message: "Tool call required - fall back to non-streaming endpoint",
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } else {
          const updated_history = [
            ...input_with_history,
            {
              role: "assistant" as const,
              content: accumulated_text.trim().slice(0, MAX_CONVERSATION_MESSAGE_CHARS),
            },
          ];

          const base_url = get_identity_service_url();
          maybe_start_background_memory_ingest({
            openai,
            base_url,
            profile_id,
            message_seq,
            updated_history,
            conversation_id: null,
          });

          console.log(`[Stream] Complete in ${Date.now() - request_start}ms`);

          const data = JSON.stringify({
            type: "done",
            text: accumulated_text.trim(),
            response_id,
            history: updated_history.slice(-20),
            used_web_search: enable_web_search,
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        controller.close();
      } catch (error) {
        const error_message = error instanceof Error ? error.message : "Streaming failed";
        console.error("[Stream] Error:", error_message);
        const data = JSON.stringify({ type: "error", error: error_message });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
