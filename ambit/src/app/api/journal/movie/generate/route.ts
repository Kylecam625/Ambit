import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import { to_string } from "@/lib/api/validate_request";
import { create_movie_task, update_movie_task } from "@/lib/journal/movie_generation_tasks";
import { run_movie_pipeline } from "@/lib/journal/movie_pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    if (!body) return bad_request("Request body is required");

    const profile_id = to_string(body.profile_id);
    const entry_date = to_string(body.entry_date);
    const voice_id = to_string(body.voice_id);
    const voice_name = to_string(body.voice_name) || null;

    if (!profile_id) return bad_request("profile_id is required");
    if (!entry_date) return bad_request("entry_date is required");
    if (!voice_id) return bad_request("voice_id is required");

    // Create the task
    const task = create_movie_task({ profile_id, entry_date, voice_id, voice_name });

    // Fire and forget — run the pipeline in the background
    void (async () => {
      try {
        update_movie_task({
          task_id: task.task_id,
          patch: { status: "running", progress_step: "splitting_text", progress_message: "Starting..." },
        });

        const { movie_id } = await run_movie_pipeline({
          profile_id,
          entry_date,
          voice_id,
          voice_name,
          on_progress: (step, message, images_done) => {
            update_movie_task({
              task_id: task.task_id,
              patch: {
                progress_step: step,
                progress_message: message,
                ...(typeof images_done === "number" ? { images_generated: images_done } : {}),
              },
            });
          },
        });

        update_movie_task({
          task_id: task.task_id,
          patch: {
            status: "succeeded",
            movie_id,
            progress_step: "complete",
            progress_message: "Movie ready!",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[MovieGenerate] Background task failed:", message);
        update_movie_task({
          task_id: task.task_id,
          patch: {
            status: "failed",
            progress_step: "failed",
            progress_message: message || "Movie generation failed",
            error: message,
          },
        });
      }
    })();

    return Response.json({ task_id: task.task_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start movie generation";
    return internal_error(message);
  }
}
