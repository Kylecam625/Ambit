/** Centralized timeout values (milliseconds). */

/** Timeout for fetching identity context from the identity service. */
export const IDENTITY_FETCH_TIMEOUT_MS = 5_000;

/** Timeout for OpenAI Responses API calls. */
export const OPENAI_RESPONSE_TIMEOUT_MS = 30_000;

/** Timeout for the tool-execution loop in the respond endpoint. */
export const TOOL_LOOP_TIMEOUT_MS = 45_000;

/** Timeout for streaming responses before falling back to non-streaming. */
export const STREAM_TIMEOUT_MS = 20_000;

/** Debounce delay before triggering TTS after response text stabilizes. */
export const TTS_DEBOUNCE_MS = 150;

/** Timeout for connecting to the OpenAI Realtime API. */
export const CONNECTION_TIMEOUT_MS = 30_000;

/** Delay between camera capture retry attempts. */
export const CAMERA_CAPTURE_DELAY_MS = 150;

/** Image task polling interval. */
export const IMAGE_POLL_INTERVAL_MS = 750;

/** Image task polling retry delay after error. */
export const IMAGE_POLL_RETRY_MS = 1_000;

/** Maximum time to poll an image generation task. */
export const IMAGE_TASK_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes
