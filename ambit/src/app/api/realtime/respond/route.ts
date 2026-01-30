import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_image_task, start_background_generate_photo_task } from "@/lib/openai/background_image_tasks";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import {
  continue_openai_response_with_tool_output,
  create_openai_response_with_tools,
  type create_openai_response_with_tools_result,
} from "@/lib/openai/openai_responses";
import { MAX_CONVERSATION_MESSAGES } from "@/lib/openai/openai_constants";
import { should_enable_web_search } from "@/lib/openai/web_search_detector";

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

  const { text, history, profile_id, message_seq } = parsed;
  const request_start = Date.now();
  const timing = {
    request_start,
    identity_start: 0,
    identity_end: 0,
    openai_start: 0,
    openai_end: 0,
    tool_iterations: 0,
  };
  
  console.log(`\n[API] ====== NEW REQUEST ======`);
  console.log(`[API] User prompt: "${text}"`);
  console.log(`[API] Profile: ${profile_id || 'anonymous'}, Message seq: ${message_seq}`);
  console.log(`[API] History size: ${history.length} messages, ~${JSON.stringify(history).length} chars`);
  const conversation_id = null;

  try {
    const openai = get_openai_client();

    let extra_instructions: string | null = null;

    if (profile_id) {
      try {
        timing.identity_start = Date.now();
        const base_url = get_identity_service_url();
        
        // Add 5s timeout to identity fetch
        const identity_timeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Identity fetch timeout after 5s")), 5000)
        );
        
        const bundle = await Promise.race([
          identity_get_profile({ base_url, profile_id }),
          identity_timeout
        ]);
        
        timing.identity_end = Date.now();
        console.log(`[API] Identity fetch took ${timing.identity_end - timing.identity_start}ms`);
        extra_instructions = build_identity_instructions({
          profile: bundle.profile,
          memory: bundle.memory,
          conversation_summaries: bundle.conversation_summaries,
        });
      } catch (err) {
        timing.identity_end = Date.now();
        console.log(`[API] Identity fetch failed after ${timing.identity_end - timing.identity_start}ms:`, err);
        // Identity lookup failed; continuing as anonymous
      }
    }

    if (parsed.active_image_task_id) {
      const task = get_image_task({ task_id: parsed.active_image_task_id });
      if (task) {
        const note = `IMAGE STATUS (PRIVATE): There is a recent image generation request.
- status: ${task.status}
- prompt: ${task.prompt}
- partial_image_index: ${task.partial_image_index ?? "none"}

If the user asks whether you're still generating the image, answer truthfully based on status:
- queued/running: say you're still generating it and it will pop up automatically when ready.
- succeeded: say it's done and should have appeared; offer to regenerate if they missed it.
- failed: apologize briefly and offer to try again.`;
        extra_instructions = extra_instructions ? `${extra_instructions}\n\n${note}` : note;
      }
    }

    const enable_web_search = should_enable_web_search(text);
    const used_web_search = enable_web_search; // Track if web search was enabled for this request
    
    if (enable_web_search) {
      console.log(`[API] Web search enabled for this request`);
    }
    
    timing.openai_start = Date.now();
    console.log(`[API] Sending request to OpenAI Responses API...`);
    
    // Add 30s timeout to OpenAI request
    const openai_timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("OpenAI request timeout after 30s")), 30000)
    );
    
    // Use auto tool choice - let the model decide when to call tools
    const result = await Promise.race([
      create_openai_response_with_tools({
        openai,
        text,
        history,
        // Intentionally stateless across turns to avoid "missing tool output" and
        // "conversation_locked" errors when users barge-in or transcript_done duplicates.
        previous_response_id: null,
        conversation_id: null,
        extra_instructions,
        // No forced_tool_name - model decides when to use tools based on semantic descriptions
        enable_web_search,
      }),
      openai_timeout
    ]);
    
    timing.openai_end = Date.now();
    const openai_duration = timing.openai_end - timing.openai_start;
    console.log(`[API] Received response from OpenAI in ${openai_duration}ms`);

    if (result.kind === "tool_request") {
      let pending: create_openai_response_with_tools_result = result;
      const ui_events: Array<Record<string, unknown>> = [];
      let tool_steps = 0;

      while (pending.kind === "tool_request") {
        tool_steps += 1;
        timing.tool_iterations += 1;
        
        // Timeout check: if we've been in tool loop for > 45s total, abort
        const elapsed = Date.now() - timing.openai_start;
        if (elapsed > 45000) {
          return new Response(
            JSON.stringify({ error: "Tool execution timeout. Please try again." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
        
        if (tool_steps > 6) {
          return new Response(
            JSON.stringify({ error: "Too many tool calls in a single turn. Please try again." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const tool_name = pending.tool_request.name;
        console.log(`[API] Tool iteration ${tool_steps}: ${tool_name}`);

        if (tool_name === "analyze_camera_frame") {
          return Response.json({
            tool_request: pending.tool_request,
            history: history.slice(-MAX_CONVERSATION_MESSAGES),
            response_id: pending.response_id,
            conversation_id: pending.conversation_id,
          });
        }

        if (tool_name === "generate_photo") {
          const prompt =
            typeof pending.tool_request.arguments?.["prompt"] === "string"
              ? String(pending.tool_request.arguments["prompt"]).trim()
              : "";
          const size =
            typeof pending.tool_request.arguments?.["size"] === "string"
              ? (String(pending.tool_request.arguments["size"]).trim() as
                  | "1024x1024"
                  | "1024x1536"
                  | "1536x1024"
                  | "auto")
              : undefined;
          const quality =
            typeof pending.tool_request.arguments?.["quality"] === "string"
              ? (String(pending.tool_request.arguments["quality"]).trim() as
                  | "low"
                  | "medium"
                  | "high")
              : undefined;

          const { task_id } = start_background_generate_photo_task({
            prompt,
            size: size ?? "1024x1024",
            quality: quality ?? "high",
            profile_id,
          });

          ui_events.push({
            type: "image_task_started",
            task_id,
            prompt,
            size: size ?? "1024x1024",
            quality: quality ?? "high",
          });

          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output: {
              ok: true,
              status: "started",
              will_display_when_ready: true,
              prompt,
              size: size ?? "1024x1024",
              quality: quality ?? "high",
            },
            extra_instructions,
          });
          continue;
        }

        return new Response(JSON.stringify({ error: `Unsupported tool request: ${tool_name}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (pending.kind !== "final") {
        return new Response(JSON.stringify({ error: "Tool loop ended unexpectedly." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const updated_history = [
        ...history,
        { role: "user" as const, content: text },
        { role: "assistant" as const, content: pending.speech_text },
      ];

      const base_url = get_identity_service_url();
      maybe_start_background_memory_ingest({
        openai,
        base_url,
        profile_id,
        message_seq,
        updated_history,
        conversation_id: pending.conversation_id || conversation_id || null,
      });

      return Response.json({
        speech_text: pending.speech_text,
        history: updated_history.slice(-MAX_CONVERSATION_MESSAGES),
        response_id: pending.response_id,
        conversation_id: pending.conversation_id,
        ui_events: ui_events.slice(-20),
        used_web_search,
      });
    }

    const base_url = get_identity_service_url();

    maybe_start_background_memory_ingest({
      openai,
      base_url,
      profile_id,
      message_seq,
      updated_history: result.updated_history,
      conversation_id: result.conversation_id || conversation_id || null,
    });

    const total_duration = Date.now() - request_start;
    const identity_time = timing.identity_end - timing.identity_start;
    const openai_time = timing.openai_end - timing.openai_start;
    console.log(`[API] Response: "${result.speech_text.substring(0, 150)}${result.speech_text.length > 150 ? '...' : ''}"`);
    console.log(`[API] Total request duration: ${total_duration}ms (identity: ${identity_time}ms, openai: ${openai_time}ms, tool iterations: ${timing.tool_iterations})`);
    console.log(`[API] ====== REQUEST COMPLETE ======\n`);

    return Response.json({
      speech_text: result.speech_text,
      history: result.updated_history.slice(-MAX_CONVERSATION_MESSAGES),
      response_id: result.response_id,
      conversation_id: result.conversation_id,
      ui_events: result.ui_events ?? [],
      used_web_search,
    });
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Failed to generate a response.";

    return new Response(JSON.stringify({ error: error_message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
