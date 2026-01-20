import type OpenAI from "openai";
import {
  MAX_CONVERSATION_MESSAGE_CHARS,
  OPENAI_DOCS_MCP_TOOL,
  SYSTEM_PROMPT,
} from "./openai_constants";
import { create_conversation_id } from "./openai_conversations";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalize_string = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
};

/**
 * Extracts the output text from an OpenAI response object.
 */
export const extract_response_text = (response: unknown): string => {
  if (!is_record(response)) {
    return "";
  }

  // Check for direct output_text (available in some SDK versions/configs)
  const direct_output_text = response["output_text"];
  if (typeof direct_output_text === "string") {
    return direct_output_text;
  }

  const output = response["output"];
  if (!Array.isArray(output) || output.length === 0) {
    return "";
  }

  for (const out of output) {
    if (!is_record(out)) continue;

    const content = out["content"];
    if (!Array.isArray(content)) continue;

    const output_text_item = content.find((item) => {
      return (
        is_record(item) && item["type"] === "output_text" && typeof item["text"] === "string"
      );
    });

    if (!is_record(output_text_item)) continue;

    const text = output_text_item["text"];
    if (typeof text === "string" && text.trim()) {
      return text;
    }
  }

  return "";
};

const responses_create = async ({
  openai,
  payload,
}: {
  openai: OpenAI;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> => {
  const openai_record = openai as unknown as Record<string, unknown>;
  const responses = openai_record["responses"];

  if (!is_record(responses)) {
    throw new Error("OpenAI client is missing responses API.");
  }

  const create = responses["create"];

  if (typeof create !== "function") {
    throw new Error("OpenAI client is missing responses.create().");
  }

  const response = await (create as (...args: unknown[]) => Promise<unknown>).call(
    responses,
    payload
  );

  if (!is_record(response)) {
    throw new Error("OpenAI response is not an object.");
  }

  return response;
};

/**
 * Creates a response using the OpenAI Responses API.
 */
export const create_openai_response = async ({
  openai,
  text,
  history = [],
  previous_response_id = null,
  conversation_id = null,
  extra_instructions = null,
}: {
  openai: OpenAI;
  text: string;
  history?: ConversationMessage[];
  previous_response_id?: string | null;
  conversation_id?: string | null;
  extra_instructions?: string | null;
}) => {
  const input_with_history: ConversationMessage[] = [
    ...history,
    { role: "user", content: text },
  ];

  const should_create_conversation =
    !conversation_id && !previous_response_id && history.length === 0;

  const next_conversation_id =
    conversation_id ??
    (should_create_conversation ? await create_conversation_id({ openai }) : null);

  const should_use_conversation = Boolean(next_conversation_id);
  const should_use_previous_response_id =
    !should_use_conversation && Boolean(previous_response_id);

  // Always send the full conversation history to maintain context
  const openai_input = input_with_history;

  const normalized_extra_instructions =
    typeof extra_instructions === "string" ? extra_instructions.trim() : "";
  const instructions = normalized_extra_instructions
    ? `${SYSTEM_PROMPT}\n\n${normalized_extra_instructions}`
    : SYSTEM_PROMPT;

  const payload: Record<string, unknown> = {
    model: "gpt-4o-mini",
    instructions,
    input: openai_input,
    tools: [OPENAI_DOCS_MCP_TOOL],
  };

  if (should_use_previous_response_id && previous_response_id) {
    payload["previous_response_id"] = previous_response_id;
  }

  if (should_use_conversation && next_conversation_id) {
    payload["conversation"] = next_conversation_id;
  }

  const response = await responses_create({ openai, payload });
  const response_id = normalize_string(response["id"]);

  if (!response_id) {
    throw new Error("OpenAI response id is missing.");
  }

  const response_text = extract_response_text(response);
  const speech_text = response_text.trim().slice(0, MAX_CONVERSATION_MESSAGE_CHARS);

  const assistant_message: ConversationMessage = {
    role: "assistant",
    content: speech_text,
  };

  const updated_history: ConversationMessage[] = [
    ...input_with_history,
    assistant_message,
  ];

  return {
    speech_text,
    updated_history,
    response_id,
    conversation_id: next_conversation_id,
  };
};
