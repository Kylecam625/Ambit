import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import { fetch_identity_context } from "@/lib/api/fetch_identity_context";
import { OPENAI_RESPONSE_TIMEOUT_MS, TOOL_LOOP_TIMEOUT_MS } from "@/lib/constants/timeouts";
import { MAX_CONVERSATION_MESSAGES, MAX_TOOL_ITERATIONS, MAX_UI_EVENTS } from "@/lib/constants/limits";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_image_task, get_last_succeeded_image_url, start_background_generate_photo_task, start_background_edit_photo_task } from "@/lib/openai/background_image_tasks";
import { execute_spotify_action, is_spotify_configured } from "@/lib/spotify/spotify_client";
import { execute_govee_action, is_govee_configured } from "@/lib/govee/govee_client";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import {
  continue_openai_response_with_tool_output,
  create_openai_response_with_tools,
  type create_openai_response_with_tools_result,
} from "@/lib/openai/openai_responses";
import { should_enable_web_search } from "@/lib/openai/web_search_detector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parse_respond_request(request);

  if (!parsed) {
    return bad_request("Text is required.");
  }

  const { text, history, profile_id, message_seq, detected_emotion } = parsed;
  const request_start = Date.now();
  const timing = {
    request_start,
    identity_start: 0,
    identity_end: 0,
    openai_start: 0,
    openai_end: 0,
    tool_iterations: 0,
  };
  
  console.log(`[API] Request: "${text.substring(0, 80)}" (profile: ${profile_id || 'anon'})`);

  try {
    const openai = get_openai_client();

    timing.identity_start = Date.now();
    const { identity_instructions } = await fetch_identity_context(profile_id);
    timing.identity_end = Date.now();

    let extra_instructions: string | null = identity_instructions || null;

    // Inject detected facial emotion as context for the AI
    if (detected_emotion && detected_emotion !== "neutral") {
      const emotion_note = `FACIAL EXPRESSION (PRIVATE — do NOT quote this verbatim): The user's face currently looks ${detected_emotion}. You may naturally acknowledge this if it feels relevant, but be subtle — don't say "I can see you look ${detected_emotion}". Instead, be perceptive like a friend would.`;
      extra_instructions = extra_instructions ? `${extra_instructions}\n\n${emotion_note}` : emotion_note;
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
    
    timing.openai_start = Date.now();
    
    const openai_timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`OpenAI request timeout after ${OPENAI_RESPONSE_TIMEOUT_MS}ms`)), OPENAI_RESPONSE_TIMEOUT_MS)
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

    if (result.kind === "tool_request") {
      let pending: create_openai_response_with_tools_result = result;
      const ui_events: Array<Record<string, unknown>> = [];
      let tool_steps = 0;

      while (pending.kind === "tool_request") {
        tool_steps += 1;
        timing.tool_iterations += 1;
        
        const elapsed = Date.now() - timing.openai_start;
        if (elapsed > TOOL_LOOP_TIMEOUT_MS) {
          return internal_error("Tool execution timeout. Please try again.");
        }
        
        if (tool_steps > MAX_TOOL_ITERATIONS) {
          return internal_error("Too many tool calls in a single turn. Please try again.");
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

        if (tool_name === "analyze_screen") {
          // Screen analysis requires client-side screen capture, similar to camera
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

        if (tool_name === "edit_photo") {
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

          // Get the last generated image to use as source
          const source_image_url = get_last_succeeded_image_url();

          if (!source_image_url) {
            pending = await continue_openai_response_with_tool_output({
              openai,
              previous_response_id: pending.response_id,
              conversation_id: null,
              call_id: pending.tool_request.call_id,
              tool_output: {
                ok: false,
                error: "No previously generated image found to edit. Generate an image first.",
              },
              extra_instructions,
            });
            continue;
          }

          const { task_id } = start_background_edit_photo_task({
            prompt,
            source_image_data_url: source_image_url,
            size: size ?? "1024x1024",
            quality: quality ?? "high",
            profile_id,
          });

          ui_events.push({
            type: "image_task_started",
            task_id,
            prompt: `Edit: ${prompt}`,
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
              editing: true,
              prompt,
            },
            extra_instructions,
          });
          continue;
        }

        if (tool_name === "set_ui_mood") {
          const mood =
            typeof pending.tool_request.arguments?.["mood"] === "string"
              ? String(pending.tool_request.arguments["mood"]).trim()
              : "neutral";

          ui_events.push({
            type: "mood_change",
            mood,
          });

          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output: {
              ok: true,
              mood_set: mood,
              note: "The UI mood has been updated. Continue the conversation naturally.",
            },
            extra_instructions,
          });
          continue;
        }

        if (tool_name === "set_timer") {
          const duration_seconds =
            typeof pending.tool_request.arguments?.["duration_seconds"] === "number"
              ? Number(pending.tool_request.arguments["duration_seconds"])
              : 0;
          const label =
            typeof pending.tool_request.arguments?.["label"] === "string"
              ? String(pending.tool_request.arguments["label"]).trim()
              : "";

          const timer_id = crypto.randomUUID();

          ui_events.push({
            type: "timer_started",
            timer_id,
            duration_seconds,
            label,
          });

          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output: {
              ok: true,
              timer_set: true,
              duration_seconds,
              label: label || undefined,
              note: "The timer is now displayed on screen and counting down. Continue the conversation naturally.",
            },
            extra_instructions,
          });
          continue;
        }

        if (tool_name === "control_music") {
          const action =
            typeof pending.tool_request.arguments?.["action"] === "string"
              ? String(pending.tool_request.arguments["action"]).trim()
              : "";
          const query =
            typeof pending.tool_request.arguments?.["query"] === "string"
              ? String(pending.tool_request.arguments["query"]).trim()
              : undefined;
          const volume_percent =
            typeof pending.tool_request.arguments?.["volume_percent"] === "number"
              ? Number(pending.tool_request.arguments["volume_percent"])
              : undefined;

          if (!is_spotify_configured()) {
            pending = await continue_openai_response_with_tool_output({
              openai,
              previous_response_id: pending.response_id,
              conversation_id: null,
              call_id: pending.tool_request.call_id,
              tool_output: {
                ok: false,
                error: "Music control is not configured yet. Spotify credentials are needed.",
              },
              extra_instructions,
            });
            continue;
          }

          const spotify_result = await execute_spotify_action({
            action,
            query,
            volume_percent,
          });

          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output: spotify_result,
            extra_instructions,
          });
          continue;
        }

        if (tool_name === "end_session") {
          // The AI wants to end the session. Continue so it can generate a
          // goodbye response, then flag the client to close the session.
          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output: {
              ok: true,
              note: "Session will end after you say goodbye. Give a warm, brief farewell.",
            },
            extra_instructions,
          });

          // After the tool loop completes, we'll add session_action: "end"
          ui_events.push({ type: "session_end_requested" });
          continue;
        }

        if (tool_name === "control_lights") {
          const action =
            typeof pending.tool_request.arguments?.["action"] === "string"
              ? String(pending.tool_request.arguments["action"]).trim()
              : "";
          const color =
            typeof pending.tool_request.arguments?.["color"] === "string"
              ? String(pending.tool_request.arguments["color"]).trim()
              : undefined;
          const brightness =
            typeof pending.tool_request.arguments?.["brightness"] === "number"
              ? Number(pending.tool_request.arguments["brightness"])
              : undefined;
          const color_temperature =
            typeof pending.tool_request.arguments?.["color_temperature"] === "number"
              ? Number(pending.tool_request.arguments["color_temperature"])
              : undefined;
          const device_name =
            typeof pending.tool_request.arguments?.["device_name"] === "string"
              ? String(pending.tool_request.arguments["device_name"]).trim()
              : undefined;

          if (!is_govee_configured()) {
            pending = await continue_openai_response_with_tool_output({
              openai,
              previous_response_id: pending.response_id,
              conversation_id: null,
              call_id: pending.tool_request.call_id,
              tool_output: {
                ok: false,
                error: "Light control is not configured yet. A Govee API key is needed.",
              },
              extra_instructions,
            });
            continue;
          }

          const govee_result = await execute_govee_action({
            action,
            color,
            brightness,
            color_temperature,
            device_name,
          });

          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output: govee_result,
            extra_instructions,
          });
          continue;
        }

        return bad_request(`Unsupported tool request: ${tool_name}`);
      }

      if (pending.kind !== "final") {
        return internal_error("Tool loop ended unexpectedly.");
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
        conversation_id: pending.conversation_id || null,
      });

      // Check if the AI called end_session during the tool loop
      const has_session_end = ui_events.some(
        (e) => e.type === "session_end_requested"
      );

      return Response.json({
        speech_text: pending.speech_text,
        history: updated_history.slice(-MAX_CONVERSATION_MESSAGES),
        response_id: pending.response_id,
        conversation_id: pending.conversation_id,
        ui_events: ui_events.slice(-MAX_UI_EVENTS),
        used_web_search,
        ...(has_session_end ? { session_action: "end" } : {}),
      });
    }

    const base_url = get_identity_service_url();

    maybe_start_background_memory_ingest({
      openai,
      base_url,
      profile_id,
      message_seq,
      updated_history: result.updated_history,
      conversation_id: result.conversation_id || null,
    });

    const total_ms = Date.now() - request_start;
    const id_ms = timing.identity_end - timing.identity_start;
    const ai_ms = timing.openai_end - timing.openai_start;
    console.log(`[API] Done in ${total_ms}ms (id: ${id_ms}ms, ai: ${ai_ms}ms)`);

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

    return internal_error(error_message);
  }
}
