/** Shared audio file validation for STT routes. */

const MAX_AUDIO_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
]);

type ValidatedAudioFile = {
  file: File;
};

type ValidationError = {
  error: string;
};

/**
 * Validate an audio file from a FormData upload.
 * Returns the validated file or an error string.
 */
export const validate_audio_file = (
  form_data: FormData
): ValidatedAudioFile | ValidationError => {
  const audio = form_data.get("file") ?? form_data.get("audio");

  if (!audio || !(audio instanceof File)) {
    return { error: "Missing audio file. Upload as 'file' or 'audio' field." };
  }

  if (audio.size === 0) {
    return { error: "Audio file is empty." };
  }

  if (audio.size > MAX_AUDIO_FILE_SIZE) {
    return {
      error: `Audio file too large (${(audio.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_AUDIO_FILE_SIZE / 1024 / 1024} MB.`,
    };
  }

  if (audio.type && !ALLOWED_AUDIO_TYPES.has(audio.type)) {
    return { error: `Unsupported audio type: ${audio.type}` };
  }

  return { file: audio };
};

/** Type guard to check if validation result is an error. */
export const is_validation_error = (
  result: ValidatedAudioFile | ValidationError
): result is ValidationError => "error" in result;
