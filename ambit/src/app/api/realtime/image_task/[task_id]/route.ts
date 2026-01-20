import { NextRequest } from "next/server";
import { get_image_task } from "@/lib/openai/background_image_tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ task_id: string }> }
): Promise<Response> {
  void request;

  const params = await context.params;
  const task_id = typeof params?.task_id === "string" ? params.task_id.trim() : "";
  if (!task_id) {
    return new Response(JSON.stringify({ error: "task_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const task = get_image_task({ task_id });
  if (!task) {
    return new Response(JSON.stringify({ error: "Task not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      task_id: task.task_id,
      status: task.status,
      prompt: task.prompt,
      size: task.size,
      quality: task.quality,
      image_saved_to_profile: task.image_saved_to_profile,
      partial_image_data_url: task.partial_image_data_url,
      partial_image_index: task.partial_image_index,
      image_data_url: task.status === "succeeded" ? task.image_data_url : null,
      error: task.status === "failed" ? task.error : null,
      created_at_ms: task.created_at_ms,
      updated_at_ms: task.updated_at_ms,
      completed_at_ms: task.completed_at_ms,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

