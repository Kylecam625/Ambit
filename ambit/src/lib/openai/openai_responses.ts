import type OpenAI from "openai";
import {
  DEVELOPER_PROMPT,
  MAX_OUTPUT_TOKENS,
  SYSTEM_PROMPT,
} from "./openai_constants";
import {
  MAX_CONVERSATION_MESSAGES,
  MAX_CONVERSATION_MESSAGE_CHARS,
} from "@/lib/constants/limits";
import { ambit_tools, select_ambit_tools, type ambit_tool_name } from "./ambit_tools";
import { get_openai_responses_model } from "./openai_client";

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

const trim_message_content = (value: string): string => value.trim().slice(0, MAX_CONVERSATION_MESSAGE_CHARS);

/**
 * Strip wake-word phrases ("Hey Ambit", "Ambit,") from the start of user
 * messages so the model never sees the AI's own name in user speech and
 * mistakes it for the user's name.
 */
const strip_wake_phrase_from_content = (text: string): string =>
  text.replace(/^\s*(hey\s+)?ambit[,.:!?\s]*/i, "").trim();

export const trim_history_messages = (
  history: ConversationMessage[]
): ConversationMessage[] =>
  history
    .slice(-MAX_CONVERSATION_MESSAGES)
    .map((message) => ({
      role: message.role,
      content:
        message.role === "user"
          ? trim_message_content(strip_wake_phrase_from_content(message.content))
          : trim_message_content(message.content),
    }))
    .filter((message) => message.content.length > 0);

export const build_instructions = ({
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
    // Malformed tool arguments JSON; fall back to empty object
    return {};
  }
};

/**
 * Extracts the first tool call from an OpenAI response.
 * We use parallel_tool_calls: false, so there should only ever be one.
 * Logs a warning if multiple are detected (shouldn't happen with our config).
 */
const extract_first_tool_call = (response: Record<string, unknown>): extracted_tool_call | null => {
  const output = response["output"];
  if (!Array.isArray(output)) return null;

  const tool_calls: extracted_tool_call[] = [];

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
      name !== "edit_photo" &&
      name !== "set_ui_mood" &&
      name !== "set_timer" &&
      name !== "control_music" &&
      name !== "control_lights" &&
      name !== "analyze_screen" &&
      name !== "end_session"
    ) {
      console.warn(`[openai_responses] Ignoring unknown tool call: ${name}`);
      continue;
    }

    tool_calls.push({
      name,
      call_id,
      arguments: parse_tool_arguments(item["arguments"]),
    });
  }

  if (tool_calls.length > 1) {
    console.warn(
      `[openai_responses] Multiple tool calls detected (${tool_calls.length}), ` +
      `but parallel_tool_calls should be false. Using first: ${tool_calls[0].name}`
    );
  }

  return tool_calls[0] ?? null;
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

  const start = Date.now();
  const model =
    typeof payload["model"] === "string" ? payload["model"] : "unknown";
  const payload_json = JSON.stringify(payload);
  const payload_bytes = Buffer.byteLength(payload_json, "utf8");
  const input_messages = Array.isArray(payload["input"]) ? payload["input"].length : 1;
  const input_chars = Array.isArray(payload["input"])
    ? payload["input"].reduce((total, item) => {
        if (!is_record(item)) return total;
        const content = item["content"];
        return typeof content === "string" ? total + content.length : total;
      }, 0)
    : 0;
  const tools_count = Array.isArray(payload["tools"]) ? payload["tools"].length : 0;
  const instructions_chars =
    typeof payload["instructions"] === "string" ? payload["instructions"].length : 0;
  const max_output_tokens =
    typeof payload["max_output_tokens"] === "number" ? payload["max_output_tokens"] : 0;
  const response = await (create as (...args: unknown[]) => Promise<unknown>).call(
    responses,
    payload
  );
  const duration_ms = Date.now() - start;
  console.log(
    `[OpenAI] responses.create model=${model} duration_ms=${duration_ms} ` +
      `bytes=${payload_bytes} input_msgs=${input_messages} input_chars=${input_chars} ` +
      `tools=${tools_count} instructions_chars=${instructions_chars} ` +
      `max_output_tokens=${max_output_tokens}`
  );
  if (!is_record(response)) {
    throw new Error("OpenAI responses.create() returned a non-object response.");
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
  enable_web_search = false,
}: {
  openai: OpenAI;
  text: string;
  history?: ConversationMessage[];
  previous_response_id?: string | null;
  conversation_id?: string | null;
  extra_instructions?: string | null;
  enable_web_search?: boolean;
}) => {
  const input_with_history: ConversationMessage[] = [
    ...trim_history_messages(history),
    { role: "user", content: text },
  ];

  // Always send the full conversation history to maintain context.
  // We intentionally avoid OpenAI "conversation" state in this app because it can get
  // stuck when tool calls are interrupted (barge-in, duplicate transcript_done, etc).
  const openai_input = input_with_history;

  const instructions = build_instructions({ extra_instructions });

  const tools = enable_web_search 
    ? [{ type: "web_search" }]
    : [];

  const payload: Record<string, unknown> = {
    model: get_openai_responses_model(),
    instructions,
    input: openai_input,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    truncation: "auto", // Let OpenAI handle context overflow gracefully
  };

  if (tools.length > 0) {
    payload["tools"] = tools;
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
    conversation_id: null,
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
  forced_tool_name = null,
  enable_web_search = false,
}: {
  openai: OpenAI;
  text: string;
  history?: ConversationMessage[];
  previous_response_id?: string | null;
  conversation_id?: string | null;
  extra_instructions?: string | null;
  forced_tool_name?: ambit_tool_name | null;
  enable_web_search?: boolean;
}): Promise<create_openai_response_with_tools_result> => {
  const input_with_history: ConversationMessage[] = [
    ...trim_history_messages(history),
    { role: "user", content: text },
  ];

  const instructions = build_instructions({ extra_instructions });

  const tools = select_ambit_tools({
    text,
    enable_web_search,
    forced_tool_name,
  });
  const tool_names = tools
    .map((tool) => (is_record(tool) && typeof tool["name"] === "string" ? tool["name"] : null))
    .filter((name): name is string => Boolean(name));
  console.log(
    `[OpenAI] Tool scope: ${tool_names.length ? tool_names.join(", ") : "none"} ` +
    `(web_search=${enable_web_search})`
  );

  const payload: Record<string, unknown> = {
    model: get_openai_responses_model(),
    instructions,
    input: input_with_history,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    truncation: "auto", // Let OpenAI handle context overflow gracefully
  };

  if (tools.length > 0) {
    payload["tools"] = tools;
    payload["tool_choice"] = forced_tool_name
      ? { type: "function", name: forced_tool_name }
      : "auto";
    payload["parallel_tool_calls"] = false; // Enforce single tool call per turn for simpler flow
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
      conversation_id: null,
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
    conversation_id: null,
  };
};

export const continue_openai_response_with_tool_output = async ({
  openai,
  previous_response_id,
  conversation_id,
  call_id,
  tool_output,
  extra_instructions = null,
  enable_web_search = false,
}: {
  openai: OpenAI;
  previous_response_id: string | null;
  conversation_id: string | null;
  call_id: string;
  tool_output: string | Record<string, unknown>;
  extra_instructions?: string | null;
  enable_web_search?: boolean;
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

  // For tool continuations, use all tools since we're mid-conversation
  const tools = enable_web_search 
    ? [{ type: "web_search" }, ...ambit_tools]
    : ambit_tools;

  const payload: Record<string, unknown> = {
    model: get_openai_responses_model(),
    instructions,
    input: [
      {
        type: "function_call_output",
        call_id: normalized_call_id,
        output: output_string,
      },
    ],
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false, // Enforce single tool call per turn for simpler flow
    max_output_tokens: MAX_OUTPUT_TOKENS,
    truncation: "auto", // Let OpenAI handle context overflow gracefully
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
