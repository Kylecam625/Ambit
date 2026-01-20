import { normalize_stt_error } from "@/lib/stt/stt_errors";
import type { stt_error_response, stt_response } from "@/lib/stt/stt_types";
import { transcribe_audio } from "@/lib/stt/transcribe_audio";

export const runtime = "nodejs";

const get_audio_file = (form_data: FormData): File | null => {
  const audio = form_data.get("audio");

  if (!audio || !(audio instanceof File)) {
    return null;
  }

  return audio;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const form_data = await request.formData();
    const audio_file = get_audio_file(form_data);

    if (!audio_file) {
      return Response.json(
        { error: "Audio file is required." } satisfies stt_error_response,
        { status: 400 },
      );
    }

    const result = await transcribe_audio({ audio_file });

    return Response.json(result satisfies stt_response);
  } catch (error) {
    return Response.json(
      { error: normalize_stt_error({ error }) } satisfies stt_error_response,
      { status: 500 },
    );
  }
}
