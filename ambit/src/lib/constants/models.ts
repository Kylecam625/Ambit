/** Centralized model names and defaults. */

/** Default model for OpenAI Responses API. */
export const DEFAULT_RESPONSES_MODEL = "gpt-5-nano";

/** Default model for camera/vision analysis. */
export const DEFAULT_CAMERA_MODEL = "gpt-5-nano";

/** Default model for memory extraction. */
export const DEFAULT_MEMORY_MODEL = "gpt-5-nano";

/** Default model for journal writing (best creative writing model). */
export const DEFAULT_JOURNAL_MODEL = "gpt-5.2";

/** Default model for image generation. */
export const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";

/** Default model for audio transcription. */
export const DEFAULT_STT_MODEL = "gpt-4o-transcribe";

/** Faster/cheaper STT model for non-critical paths. */
export const FAST_STT_MODEL = "gpt-4o-mini-transcribe";

/** Default ElevenLabs TTS model. */
export const DEFAULT_TTS_MODEL = "eleven_v3";

/** Faster ElevenLabs TTS model. */
export const FAST_TTS_MODEL = "eleven_flash_v2_5";

/** Resolve a model name from an environment variable with a default fallback. */
export const resolve_model = (env_key: string, fallback: string): string =>
  process.env[env_key]?.trim() || fallback;
