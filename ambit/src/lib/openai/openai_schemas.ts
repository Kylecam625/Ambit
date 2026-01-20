import { NextRequest } from "next/server";
import { ConversationMessage, is_record } from "./openai_responses";
import { MAX_CONVERSATION_MESSAGES, MAX_CONVERSATION_MESSAGE_CHARS } from "./openai_constants";

export type RequestBody = {
  text?: string;
  history?: ConversationMessage[];
  previous_response_id?: string | null;
  conversation_id?: string | null;
  profile_id?: string | null;
  message_seq?: number;
};

export const sanitize_history = (value: unknown): ConversationMessage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item): ConversationMessage | null => {
      if (!is_record(item)) {
        return null;
      }

      const role = item["role"];
      const content = item["content"];

      if (role !== "user" && role !== "assistant") {
        return null;
      }

      if (typeof content !== "string") {
        return null;
      }

      const trimmed = content.trim();

      if (!trimmed) {
        return null;
      }

      return {
        role,
        content: trimmed.slice(0, MAX_CONVERSATION_MESSAGE_CHARS),
      };
    })
    .filter((item): item is ConversationMessage => Boolean(item));

  return normalized.slice(-MAX_CONVERSATION_MESSAGES);
};

export const parse_respond_request = async (
  request: NextRequest
): Promise<Required<RequestBody> | null> => {
  try {
    const data = (await request.json()) as RequestBody | null;
    const text =
      typeof data?.text === "string"
        ? data.text.trim().slice(0, MAX_CONVERSATION_MESSAGE_CHARS)
        : "";
    
    if (!text) {
      return null;
    }

    const history = sanitize_history(data?.history);
    const previous_response_id =
      typeof data?.previous_response_id === "string"
        ? data.previous_response_id.trim()
        : null;
    const conversation_id =
      typeof data?.conversation_id === "string"
        ? data.conversation_id.trim()
        : null;
    const profile_id =
      typeof data?.profile_id === "string" ? data.profile_id.trim() : null;
    const message_seq =
      typeof data?.message_seq === "number" && Number.isFinite(data.message_seq)
        ? Math.max(0, Math.floor(data.message_seq))
        : 0;

    return {
      text,
      history,
      previous_response_id,
      conversation_id,
      profile_id,
      message_seq,
    };
  } catch {
    return null;
  }
};
