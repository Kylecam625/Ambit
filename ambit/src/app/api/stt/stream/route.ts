import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import {
  validate_audio_file,
  is_validation_error,
} from "@/lib/api/validate_audio_file";
import { transcribe_audio_stream } from "@/lib/stt/transcribe_audio_stream";
import { get_default_stt_config } from "@/lib/stt/stt_config";
import { TranscriptionError } from "@/lib/stt/stt_errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const form_data = await request.formData();
    const validation = validate_audio_file(form_data);

    if (is_validation_error(validation)) {
      return bad_request(validation.error);
    }

    const config = get_default_stt_config();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const delta of transcribe_audio_stream(
            validation.file,
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
    return internal_error(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
