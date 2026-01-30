import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import { ambit_tools } from "@/lib/openai/ambit_tools";
import { should_enable_web_search } from "@/lib/openai/web_search_detector";
import { build_instructions, openai_responses_create } from "@/lib/openai/openai_responses";
import { get_openai_responses_model } from "@/lib/openai/openai_client";
import { MAX_CONVERSATION_MESSAGE_CHARS } from "@/lib/openai/openai_constants";
import { DEVELOPER_PROMPT, SYSTEM_PROMPT } from "@/lib/openai/openai_constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const build_instructions_fn = ({
  extra_instructions,
}: {
  extra_instructions: string | null;
}): string => {
  const normalized_extra_instructions =
    typeof extra_instructions === "string" ? extra_instructions.trim() : "";
  const base_instructions = `${DEVELOPER_PROMPT}\n\n${SYSTEM_PROMPT}`;
  return normalized_extra_instructions
    ? `${base_instructions}\n\n${normalized_extra_instructions}`
    : base_instructions;
};

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parse_respond_request(request);

  if (!parsed) {
    return new Response(JSON.stringify({ error: "Text is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { text, history, profile_id, message_seq } = parsed;
  const request_start = Date.now();
  
  console.log(`\n[API STREAM] ====== NEW STREAMING REQUEST ======`);
  console.log(`[API STREAM] User prompt: "${text}"`);
  console.log(`[API STREAM] Profile: ${profile_id || 'anonymous'}, Message seq: ${message_seq}`);

  const encoder = new TextEncoder();
  
  console.log(`[API STREAM] Stream handler starting...`);
  
  const stream = new ReadableStream({
    async start(controller) {
      console.log(`[API STREAM] Inside stream.start()`);
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
            console.log(`[API STREAM] Identity loaded`);
          } catch (e) {
            console.error(`[API STREAM] Identity load failed:`, e);
            // Identity lookup failed; continuing as anonymous
          }
        }

        const enable_web_search = should_enable_web_search(text);
        
        const input_with_history: ConversationMessage[] = [
          ...history,
          { role: "user", content: text },
        ];

        const instructions = build_instructions_fn({ extra_instructions });
        // Always expose all tools - let the model decide when to use them
        const tools = enable_web_search 
          ? [{ type: "web_search" }, ...ambit_tools]
          : ambit_tools;

        // Use auto tool choice - model decides when to call tools
        const tool_choice = "auto";

        console.log(`[API STREAM] Using ${ambit_tools.length} tools, web_search: ${enable_web_search}, tool_choice: auto`);
        console.log(`[API STREAM] Instructions: ${instructions.length} chars, History: ${history.length} msgs`);

        const payload: Record<string, unknown> = {
          model: get_openai_responses_model(),
          instructions,
          input: input_with_history,
          tools,
          tool_choice,
          stream: true,
        };

        const openai_record = openai as unknown as Record<string, unknown>;
        const responses = openai_record["responses"];

        if (!is_record(responses)) {
          throw new Error("OpenAI client is missing responses API.");
        }

        const create = responses["create"];

        if (typeof create !== "function") {
          throw new Error("OpenAI client is missing responses.create().");
        }

        console.log(`[API STREAM] Calling OpenAI responses.create...`);
        const stream_start = Date.now();
        
        const response_stream = await (create as (...args: unknown[]) => Promise<unknown>).call(
          responses,
          payload
        );

        const stream_create_time = Date.now() - stream_start;
        console.log(`[API STREAM] Stream object created in ${stream_create_time}ms, starting to iterate...`);

        let accumulated_text = "";
        let response_id = "";
        let has_tool_call = false;
        let first_delta_time = 0;
        let delta_count = 0;
        let event_count = 0;

        console.log(`[API STREAM] Entering for-await loop...`);

        for await (const event of response_stream as AsyncIterable<unknown>) {
          event_count++;
          if (event_count === 1) {
            console.log(`[API STREAM] First event received after ${Date.now() - stream_start}ms`);
          }
          
          if (!is_record(event)) {
            console.log(`[API STREAM] Event ${event_count} is not a record`);
            continue;
          }
          
          const event_type = event["type"];
          
          if (event_count <= 5 || event_type === "response.output_text.delta") {
            console.log(`[API STREAM] Event ${event_count}: ${event_type}`);
          }

          // Send event type for client tracking
          if (event_type === "response.output_text.delta") {
            const delta = event["delta"];
            if (typeof delta === "string") {
              accumulated_text += delta;
              delta_count++;
              
              if (!first_delta_time) {
                first_delta_time = Date.now();
                const ttfd = first_delta_time - stream_start;
                console.log(`[API STREAM] First delta received from OpenAI after ${ttfd}ms: "${delta}"`);
              }
              
              // Send text delta event immediately
              const data = JSON.stringify({ type: "text_delta", delta, accumulated: accumulated_text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              
              if (delta_count % 10 === 0) {
                console.log(`[API STREAM] Sent ${delta_count} deltas, accumulated: ${accumulated_text.length} chars`);
              }
            }
          }

          if (event_type === "response.created") {
            const response_obj = event["response"];
            if (is_record(response_obj) && typeof response_obj["id"] === "string") {
              response_id = response_obj["id"];
            }
          }

          // Check for tool calls
          if (event_type === "response.function_call_arguments.done") {
            has_tool_call = true;
          }

          if (event_type === "response.done" || event_type === "response.completed") {
            break;
          }
        }

        // If tool call detected, send tool request event
        if (has_tool_call) {
          const data = JSON.stringify({ 
            type: "requires_tool", 
            message: "Tool call required - fall back to non-streaming endpoint"
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } else {
          // Send final response
          const updated_history = [
            ...input_with_history,
            { role: "assistant" as const, content: accumulated_text.trim().slice(0, MAX_CONVERSATION_MESSAGE_CHARS) },
          ];

          // Trigger background memory ingest
          const base_url = get_identity_service_url();
          maybe_start_background_memory_ingest({
            openai,
            base_url,
            profile_id,
            message_seq,
            updated_history,
            conversation_id: null,
          });

          const total_duration = Date.now() - request_start;
          const streaming_duration = Date.now() - stream_start;
          console.log(`[API STREAM] Streaming complete in ${total_duration}ms (streaming: ${streaming_duration}ms, deltas: ${delta_count})`);

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
