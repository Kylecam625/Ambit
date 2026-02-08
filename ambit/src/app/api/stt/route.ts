import { bad_request, internal_error } from "@/lib/api/error_response";
import {
  validate_audio_file,
  is_validation_error,
} from "@/lib/api/validate_audio_file";
import { normalize_stt_error } from "@/lib/stt/stt_errors";
import type { stt_response } from "@/lib/stt/stt_types";
import { transcribe_audio } from "@/lib/stt/transcribe_audio";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const form_data = await request.formData();
    const validation = validate_audio_file(form_data);

    if (is_validation_error(validation)) {
      return bad_request(validation.error);
    }

    const result = await transcribe_audio({ audio_file: validation.file });

    return Response.json(result satisfies stt_response);
  } catch (error) {
    return internal_error(normalize_stt_error({ error }));
  }
}
