/** Centralized limit values. */

/** Maximum number of conversation messages sent to the API. */
export const MAX_CONVERSATION_MESSAGES = 20;

/** Maximum character length per conversation message. */
export const MAX_CONVERSATION_MESSAGE_CHARS = 1200;

/** Maximum tool call iterations in the respond endpoint. */
export const MAX_TOOL_ITERATIONS = 6;

/** Maximum number of in-memory background image tasks. */
export const MAX_IMAGE_TASKS = 100;

/** TTL for in-memory image tasks (milliseconds). */
export const IMAGE_TASK_TTL_MS = 30 * 60 * 1_000; // 30 minutes

/** Number of recent UI events to keep. */
export const MAX_UI_EVENTS = 20;

/** Number of camera capture attempts before giving up. */
export const CAMERA_CAPTURE_ATTEMPTS = 20;

/** Memory ingestion batch size (every N messages). */
export const MEMORY_BATCH_SIZE_MESSAGES = 10;

/** Max recent conversation summaries to include in memory extraction. */
export const MAX_RECENT_SUMMARIES = 10;
