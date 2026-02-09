import { NextRequest } from "next/server";
import { bad_request, not_found } from "@/lib/api/error_response";
import { get_movie_task } from "@/lib/journal/movie_generation_tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
): Promise<Response> {
  const { task_id } = await params;

  if (!task_id?.trim()) {
    return bad_request("task_id is required");
  }

  const task = get_movie_task({ task_id: task_id.trim() });

  if (!task) {
    return not_found("Task not found or expired");
  }

  return Response.json({
    task_id: task.task_id,
    status: task.status,
    progress_step: task.progress_step,
    progress_message: task.progress_message,
    images_generated: task.images_generated,
    images_total: task.images_total,
    movie_id: task.movie_id,
    error: task.error,
  });
}
