import { NextRequest } from "next/server";
import { build_identity_instructions } from "@/lib/identity/identity_prompt";
import { maybe_start_background_memory_ingest } from "@/lib/identity/background_memory_ingest";
import { identity_get_profile } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { get_image_task, start_background_generate_photo_task } from "@/lib/openai/background_image_tasks";
import {
  get_google_oauth_redirect_url,
  build_google_oauth2_client,
} from "@/lib/google_calendar/google_oauth";
import { get_google_calendar_refresh_token } from "@/lib/google_calendar/token_store";
import {
  google_calendar_create_event,
  google_calendar_delete_event,
  google_calendar_get_event,
  google_calendar_list_events,
  google_calendar_update_event,
} from "@/lib/google_calendar/calendar_api";
import { get_openai_client } from "@/lib/openai/openai_client";
import { parse_respond_request } from "@/lib/openai/openai_schemas";
import {
  continue_openai_response_with_tool_output,
  create_openai_response_with_tools,
  type create_openai_response_with_tools_result,
} from "@/lib/openai/openai_responses";
import { MAX_CONVERSATION_MESSAGES } from "@/lib/openai/openai_constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const to_number = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};
const to_int_or_null = (value: unknown): number | null => {
  const n = to_number(value);
  if (n === null) return null;
  return Math.floor(n);
};
const clamp_int = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.floor(value)));

const parse_date_or_null = (value: unknown): Date | null => {
  const s = to_string(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
};

const should_force_camera_tool = (text: string): boolean => {
  const t = (text || "").toLowerCase().trim();
  if (!t) return false;

  // Respect explicit negation.
  if (t.includes("not like i'm asking") && t.includes("camera")) return false;
  if (t.includes("do not") && t.includes("camera")) return false;
  if (t.includes("don't") && t.includes("camera")) return false;

  // Explicit camera/vision requests that users often phrase without saying "camera".
  if (t.includes("what do you see")) return true;
  if (t.includes("look at this")) return true;
  if (t.includes("check this out")) return true;
  if (t.includes("watch this")) return true;
  if (t.includes("see this")) return true;
  if (t.includes("see me")) return true;
  if (t.includes("can you see me")) return true;
  if (t.includes("could you see me")) return true;
  if (t.includes("are you able to see me")) return true;
  if (t.includes("were you able to see me")) return true;
  if (t.includes("analyze the camera")) return true;
  if (t.includes("analyze my camera")) return true;
  if (t.includes("use the camera")) return true;
  if (t.includes("use your camera")) return true;

  return false;
};

const build_event_reminders = (minutes_before: number | null): Record<string, unknown> | null => {
  if (minutes_before === null) return null;
  const minutes = clamp_int(minutes_before, 0, 40320);
  return {
    useDefault: false,
    overrides: [{ method: "popup", minutes }],
  };
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
  console.log(`[API /respond] Received request: message_seq=${message_seq}, profile_id=${profile_id}, text="${text.substring(0, 50)}..."`);
  const conversation_id = null;
  const request_origin = new URL(request.url).origin;


  try {
    const openai = get_openai_client();

    let extra_instructions: string | null = null;

    if (profile_id) {
      try {
        const base_url = get_identity_service_url();
        const bundle = await identity_get_profile({ base_url, profile_id });
        console.log(`[API /respond] Fetched profile: ${bundle.profile.name} (${profile_id})`);
        extra_instructions = build_identity_instructions({
          profile: bundle.profile,
          memory: bundle.memory,
          conversation_summaries: bundle.conversation_summaries,
        });
      } catch (error) {
        console.warn("Identity lookup failed; continuing as anonymous.", error);
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

    const result = await create_openai_response_with_tools({
      openai,
      text,
      history,
      // Intentionally stateless across turns to avoid "missing tool output" and
      // "conversation_locked" errors when users barge-in or transcript_done duplicates.
      previous_response_id: null,
      conversation_id: null,
      extra_instructions,
      forced_tool_name: should_force_camera_tool(text) ? "analyze_camera_frame" : null,
    });

    if (result.kind === "tool_request") {
      let pending: create_openai_response_with_tools_result = result;
      const ui_events: Array<Record<string, unknown>> = [];
      let tool_steps = 0;

      while (pending.kind === "tool_request") {
        tool_steps += 1;
        if (tool_steps > 6) {
          return new Response(
            JSON.stringify({ error: "Too many tool calls in a single turn. Please try again." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const tool_name = pending.tool_request.name;

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

        const is_calendar_tool =
          tool_name === "calendar_list_events" ||
          tool_name === "calendar_get_event" ||
          tool_name === "calendar_create_event" ||
          tool_name === "calendar_update_event" ||
          tool_name === "calendar_delete_event";

        if (is_calendar_tool) {
          const refresh_token = await get_google_calendar_refresh_token({ profile_id });

          if (!refresh_token) {
            pending = await continue_openai_response_with_tool_output({
              openai,
              previous_response_id: pending.response_id,
              conversation_id: null,
              call_id: pending.tool_request.call_id,
              tool_output: {
                ok: false,
                error: "not_connected",
                message:
                  "Google Calendar is not connected yet. Ask the user to connect it in Settings.",
                connect_url: `/api/google_calendar/connect?profile_id=${encodeURIComponent(
                  profile_id || "anonymous"
                )}`,
              },
              extra_instructions,
            });
            continue;
          }

          const redirect_url = get_google_oauth_redirect_url({ request_origin });
          const oauth = build_google_oauth2_client({ redirect_url });
          oauth.setCredentials({ refresh_token });

          const args = pending.tool_request.arguments ?? {};
          const calendar_id =
            typeof args["calendar_id"] === "string" && String(args["calendar_id"]).trim()
              ? String(args["calendar_id"]).trim()
              : "primary";

          const tool_output = await (async (): Promise<Record<string, unknown>> => {
            if (tool_name === "calendar_list_events") {
              const start =
                parse_date_or_null(args["range_start_iso"]) ?? new Date(Date.now());
              const end =
                parse_date_or_null(args["range_end_iso"]) ??
                new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
              const time_min = start.toISOString();
              const time_max = end.toISOString();
              const query = typeof args["query"] === "string" ? to_string(args["query"]) : null;
              const max_results = to_int_or_null(args["max_results"]);

              const data = await google_calendar_list_events({
                auth: oauth,
                calendar_id,
                time_min,
                time_max,
                query,
                max_results,
              });

              return { ok: true, ...data };
            }

            if (tool_name === "calendar_get_event") {
              const event_id = to_string(args["event_id"]);
              if (!event_id) return { ok: false, error: "event_id_required" };
              const data = await google_calendar_get_event({ auth: oauth, calendar_id, event_id });
              return { ok: true, ...data };
            }

            if (tool_name === "calendar_create_event") {
              const summary = to_string(args["summary"]);
              const start_iso = to_string(args["start_iso"]);
              if (!summary) return { ok: false, error: "summary_required" };
              const start_date = parse_date_or_null(start_iso);
              if (!start_date) return { ok: false, error: "invalid_start_iso" };

              const duration_minutes = clamp_int(to_int_or_null(args["duration_minutes"]) ?? 30, 1, 24 * 60);
              const end_date = new Date(start_date.getTime() + duration_minutes * 60 * 1000);

              const reminder_minutes_before = to_int_or_null(args["reminder_minutes_before"]);
              const reminders = build_event_reminders(reminder_minutes_before);

              const event = {
                summary,
                description: to_string(args["description"]) || undefined,
                location: to_string(args["location"]) || undefined,
                start: { dateTime: start_date.toISOString() },
                end: { dateTime: end_date.toISOString() },
                ...(reminders ? { reminders } : {}),
              };

              const data = await google_calendar_create_event({
                auth: oauth,
                calendar_id,
                event,
              });

              return { ok: true, ...data };
            }

            if (tool_name === "calendar_update_event") {
              const event_id = to_string(args["event_id"]);
              if (!event_id) return { ok: false, error: "event_id_required" };

              const patch: Record<string, unknown> = {};

              const summary = to_string(args["summary"]);
              if (summary) patch["summary"] = summary;

              const description = to_string(args["description"]);
              if (description) patch["description"] = description;

              const location = to_string(args["location"]);
              if (location) patch["location"] = location;

              const reminder_minutes_before = to_int_or_null(args["reminder_minutes_before"]);
              const reminders = build_event_reminders(reminder_minutes_before);
              if (reminders) patch["reminders"] = reminders;

              const maybe_start_date = parse_date_or_null(args["start_iso"]);
              const duration_minutes_arg = to_int_or_null(args["duration_minutes"]);
              const has_time_change = Boolean(maybe_start_date) || duration_minutes_arg !== null;

              if (has_time_change) {
                const existing = await google_calendar_get_event({ auth: oauth, calendar_id, event_id });
                const existing_event = existing.event as Record<string, unknown> | undefined;
                const existing_start_raw = existing_event?.["start"];
                const existing_end_raw = existing_event?.["end"];
                const existing_start = parse_date_or_null(existing_start_raw);
                const existing_end = parse_date_or_null(existing_end_raw);
                const existing_duration_minutes =
                  existing_start && existing_end
                    ? Math.max(1, Math.round((existing_end.getTime() - existing_start.getTime()) / 60000))
                    : 30;

                const start_date = maybe_start_date ?? existing_start ?? new Date();
                const duration_minutes = clamp_int(
                  duration_minutes_arg ?? existing_duration_minutes,
                  1,
                  24 * 60
                );
                const end_date = new Date(start_date.getTime() + duration_minutes * 60 * 1000);

                patch["start"] = { dateTime: start_date.toISOString() };
                patch["end"] = { dateTime: end_date.toISOString() };
              }

              if (Object.keys(patch).length === 0) {
                return { ok: false, error: "no_fields_to_update" };
              }

              const data = await google_calendar_update_event({
                auth: oauth,
                calendar_id,
                event_id,
                patch,
              });

              return { ok: true, ...data };
            }

            if (tool_name === "calendar_delete_event") {
              const event_id = to_string(args["event_id"]);
              if (!event_id) return { ok: false, error: "event_id_required" };
              const data = await google_calendar_delete_event({ auth: oauth, calendar_id, event_id });
              return { ok: true, ...data };
            }

            return { ok: false, error: "unsupported_calendar_tool" };
          })();

          pending = await continue_openai_response_with_tool_output({
            openai,
            previous_response_id: pending.response_id,
            conversation_id: null,
            call_id: pending.tool_request.call_id,
            tool_output,
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
