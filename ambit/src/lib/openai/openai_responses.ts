import type OpenAI from "openai";
import {
  DEVELOPER_PROMPT,
  MAX_CONVERSATION_MESSAGE_CHARS,
  OPENAI_DOCS_MCP_TOOL,
  SYSTEM_PROMPT,
} from "./openai_constants";
import { create_conversation_id } from "./openai_conversations";
import { ambit_tools, type ambit_tool_name } from "./ambit_tools";

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

const build_instructions = ({
  extra_instructions,
}: {
  extra_instructions: string | null;
}): string => {
  const normalized_extra_instructions =
    typeof extra_instructions === "string" ? extra_instructions.trim() : "";
  const base_instructions = `${DEVELOPER_PROMPT}\n\n${SYSTEM_PROMPT}`;
  return normalized_extra_instructions
    ? `${base_instructions}\n\n${normalized_extra_instructions}`
    : base_instructions;
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

type extracted_tool_call = {
  name: ambit_tool_name;
  call_id: string;
  arguments: Record<string, unknown>;
};

const parse_tool_arguments = (value: unknown): Record<string, unknown> => {
  if (is_record(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return is_record(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const extract_first_tool_call = (response: Record<string, unknown>): extracted_tool_call | null => {
  const output = response["output"];
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!is_record(item)) continue;

    const type = item["type"];
    const is_tool_call = type === "function_call" || type === "tool_call";
    if (!is_tool_call) continue;

    const name = item["name"];
    if (typeof name !== "string") continue;

    const call_id =
      typeof item["call_id"] === "string"
        ? item["call_id"]
        : typeof item["tool_call_id"] === "string"
          ? item["tool_call_id"]
          : typeof item["id"] === "string"
            ? item["id"]
            : "";
    if (!call_id.trim()) continue;

    if (
      name !== "analyze_camera_frame" &&
      name !== "generate_photo" &&
      name !== "send_text_message"
    ) {
      continue;
    }

    return {
      name,
      call_id,
      arguments: parse_tool_arguments(item["arguments"]),
    };
  }

  return null;
};

export const openai_responses_create = async ({
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

  const instructions = build_instructions({ extra_instructions });

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

  const response = await openai_responses_create({ openai, payload });
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

export type tool_request = {
  name: ambit_tool_name;
  call_id: string;
  arguments: Record<string, unknown>;
};

export type create_openai_response_with_tools_result =
  | {
      kind: "final";
      speech_text: string;
      updated_history: ConversationMessage[];
      response_id: string;
      conversation_id: string | null;
      ui_events?: Array<Record<string, unknown>>;
    }
  | {
      kind: "tool_request";
      tool_request: tool_request;
      response_id: string;
      conversation_id: string | null;
    };

export const create_openai_response_with_tools = async ({
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
}): Promise<create_openai_response_with_tools_result> => {
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

  const instructions = build_instructions({ extra_instructions });

  const payload: Record<string, unknown> = {
    model: "gpt-4o-mini",
    instructions,
    input: input_with_history,
    tools: ambit_tools,
    tool_choice: "auto",
  };

  if (should_use_previous_response_id && previous_response_id) {
    payload["previous_response_id"] = previous_response_id;
  }

  if (should_use_conversation && next_conversation_id) {
    payload["conversation"] = next_conversation_id;
  }

  const response = await openai_responses_create({ openai, payload });
  const response_id = normalize_string(response["id"]);

  if (!response_id) {
    throw new Error("OpenAI response id is missing.");
  }

  const tool_call = extract_first_tool_call(response);
  if (tool_call) {
    return {
      kind: "tool_request",
      tool_request: tool_call,
      response_id,
      conversation_id: next_conversation_id,
    };
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
    kind: "final",
    speech_text,
    updated_history,
    response_id,
    conversation_id: next_conversation_id,
  };
};

export const continue_openai_response_with_tool_output = async ({
  openai,
  previous_response_id,
  conversation_id,
  call_id,
  tool_output,
  extra_instructions = null,
}: {
  openai: OpenAI;
  previous_response_id: string | null;
  conversation_id: string | null;
  call_id: string;
  tool_output: string | Record<string, unknown>;
  extra_instructions?: string | null;
}): Promise<create_openai_response_with_tools_result> => {
  const normalized_previous_response_id = normalize_string(previous_response_id);
  const normalized_conversation_id = normalize_string(conversation_id);
  const normalized_call_id = normalize_string(call_id);

  if (!normalized_call_id) {
    throw new Error("tool call_id is required.");
  }

  const instructions = build_instructions({ extra_instructions });
  const output_string =
    typeof tool_output === "string" ? tool_output : JSON.stringify(tool_output);

  const payload: Record<string, unknown> = {
    model: "gpt-4o-mini",
    instructions,
    input: [
      {
        type: "function_call_output",
        call_id: normalized_call_id,
        output: output_string,
      },
    ],
    tools: ambit_tools,
    tool_choice: "auto",
  };

  if (normalized_conversation_id) {
    payload["conversation"] = normalized_conversation_id;
  } else if (normalized_previous_response_id) {
    payload["previous_response_id"] = normalized_previous_response_id;
  }

  const response = await openai_responses_create({ openai, payload });
  const response_id = normalize_string(response["id"]);

  if (!response_id) {
    throw new Error("OpenAI response id is missing.");
  }

  const tool_call = extract_first_tool_call(response);
  if (tool_call) {
    return {
      kind: "tool_request",
      tool_request: tool_call,
      response_id,
      conversation_id: normalized_conversation_id ?? null,
    };
  }

  const response_text = extract_response_text(response);
  const speech_text = response_text.trim().slice(0, MAX_CONVERSATION_MESSAGE_CHARS);

  return {
    kind: "final",
    speech_text,
    updated_history: [],
    response_id,
    conversation_id: normalized_conversation_id ?? null,
  };
};
