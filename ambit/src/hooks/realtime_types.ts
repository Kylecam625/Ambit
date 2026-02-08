/** Shared types for the realtime STT hook family. */

export type mic_device = {
  device_id: string;
  label: string;
};

export type voice_option = {
  voice_id: string;
  name: string;
  preview_url: string | null;
};

export type conversation_message = {
  role: "user" | "assistant";
  content: string;
};

export type ui_event = {
  type: string;
  [key: string]: unknown;
};

export type word_timing = {
  word: string;
  start_time: number;
  end_time: number;
};

export const MAX_CONVERSATION_MESSAGES = 20;
export const MAX_CONVERSATION_MESSAGE_CHARS = 2000;

export const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const normalize_conversation_history = (
  value: unknown
): conversation_message[] => {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item): conversation_message | null => {
      if (!is_record(item)) return null;
      const role = item["role"];
      const content = item["content"];
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string") return null;
      const trimmed = content.trim();
      if (!trimmed) return null;
      return { role, content: trimmed.slice(0, MAX_CONVERSATION_MESSAGE_CHARS) };
    })
    .filter((item): item is conversation_message => Boolean(item));

  return normalized.slice(-MAX_CONVERSATION_MESSAGES);
};

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
