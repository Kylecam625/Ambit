import { NextRequest } from "next/server";
import { transcribe_audio_stream } from "@/lib/stt/transcribe_audio_stream";
import { get_default_stt_config } from "@/lib/stt/stt_config";
import { TranscriptionError } from "@/lib/stt/stt_errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const form_data = await request.formData();
    const audio_file = form_data.get("audio");

    if (!audio_file || !(audio_file instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: "Audio file is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const config = get_default_stt_config();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const delta of transcribe_audio_stream(
            audio_file,
            config
          )) {
            const sse_message = `data: ${JSON.stringify(delta)}\n\n`;
            controller.enqueue(encoder.encode(sse_message));
          }
          controller.close();
        } catch (error) {
          if (error instanceof TranscriptionError) {
            const error_message = `data: ${JSON.stringify({
              type: "error",
              error: error.message,
              code: error.code,
            })}\n\n`;
            controller.enqueue(encoder.encode(error_message));
          } else {
            const error_message = `data: ${JSON.stringify({
              type: "error",
              error: "Unknown transcription error",
            })}\n\n`;
            controller.enqueue(encoder.encode(error_message));
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const error_message =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: error_message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
