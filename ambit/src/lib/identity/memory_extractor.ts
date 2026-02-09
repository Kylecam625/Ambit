import type OpenAI from "openai";
import { extract_response_text, is_record } from "@/lib/openai/openai_responses";
import { get_openai_memory_model } from "@/lib/openai/openai_client";

export type extracted_memory_update = {
  conversation_summary: string;
  memory_patch: {
    facts: string[];
    preferences: string[];
    notes: string[];
  };
};

export type memory_cleanup_suggestion = {
  tags_to_remove: string[];
  facts_to_remove: string[];
  preferences_to_remove: string[];
  notes_to_remove: string[];
};

export type extracted_memory_update_batch = {
  conversation_summary: string;
  memory_patch: {
    tags_set: Array<{ key: string; value: string }>;
    tags_unset: string[];
    facts_add: string[];
    preferences_add: string[];
    notes_add: string[];
  };
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

const MEMORY_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    conversation_summary: {
      type: "string",
      maxLength: 400,
    },
    memory_patch: {
      type: "object",
      additionalProperties: false,
      properties: {
        facts: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 12 },
        preferences: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 12 },
        notes: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 12 },
      },
      required: ["facts", "preferences", "notes"],
    },
  },
  required: ["conversation_summary", "memory_patch"],
};

const MEMORY_BATCH_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    conversation_summary: {
      type: "string",
      maxLength: 400,
    },
    memory_patch: {
      type: "object",
      additionalProperties: false,
      properties: {
        tags_set: {
          type: "array",
          maxItems: 40,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              key: { type: "string", maxLength: 64 },
              value: { type: "string", maxLength: 160 },
            },
            required: ["key", "value"],
          },
        },
        tags_unset: { type: "array", items: { type: "string", maxLength: 64 }, maxItems: 30 },
        facts_add: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 12 },
        preferences_add: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 12 },
        notes_add: { type: "array", items: { type: "string", maxLength: 220 }, maxItems: 12 },
      },
      required: ["tags_set", "tags_unset", "facts_add", "preferences_add", "notes_add"],
    },
  },
  required: ["conversation_summary", "memory_patch"],
};

const normalize_string_array = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => Boolean(v));
};

const normalize_kv_array = (value: unknown): Array<{ key: string; value: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!is_record(item)) return null;
      const key = typeof item["key"] === "string" ? item["key"].trim() : "";
      const value = typeof item["value"] === "string" ? item["value"].trim() : "";
      if (!key || !value) return null;
      return { key, value };
    })
    .filter((v): v is { key: string; value: string } => Boolean(v));
};

export const extract_identity_memory_update = async ({
  openai,
  profile_json,
  memory_json,
  recent_summaries_json,
  user_text,
  assistant_text,
}: {
  openai: OpenAI;
  profile_json: string;
  memory_json: string;
  recent_summaries_json: string;
  user_text: string;
  assistant_text: string;
}): Promise<extracted_memory_update> => {
  const instructions = [
    "You extract durable user memory + a short conversation summary for a social AI.",
    "",
    "WHAT TO SAVE (only these):",
    "- Durable personal facts: name, job/occupation, relationships, family, hometown, pets, significant life events.",
    "- Durable preferences: music taste, food preferences, hobbies, interests, communication style.",
    "- Notes: only meaningful personal context worth remembering long-term (e.g. 'Just moved to Austin').",
    "",
    "WHAT TO NEVER SAVE:",
    "- What the user asked the AI to do (tool usage, commands, requests like 'turn on lights', 'play music').",
    "- Conversation topics or what was discussed — that is what the summary field is for.",
    "- Anything about the AI's capabilities, limitations, or responses.",
    "- Transient states ('user is tired', 'user is testing', 'user seems frustrated').",
    "- Technical details about the system, errors, or debugging.",
    "- Anything already present in EXISTING_MEMORY_JSON — do not duplicate.",
    "",
    "OTHER RULES:",
    "- Only extract facts/preferences the user explicitly stated or clearly confirmed.",
    "- Do NOT infer anything from appearance or identity context beyond what is provided.",
    "- Avoid sensitive personal data (medical, financial, biometrics, passwords, illegal activity).",
    "- If there is nothing new worth saving, return empty arrays in memory_patch.",
    "- conversation_summary should be 1–2 sentences describing what the user talked about.",
    "- When in doubt, save NOTHING. Empty arrays are better than noise.",
    "",
    "Return JSON that matches the provided JSON Schema exactly.",
  ].join("\n");

  const input = [
    {
      role: "user",
      content: [
        "PROFILE_JSON:",
        profile_json,
        "",
        "EXISTING_MEMORY_JSON:",
        memory_json,
        "",
        "RECENT_CONVERSATION_SUMMARIES_JSON:",
        recent_summaries_json,
        "",
        "LATEST_TURN:",
        `USER: ${user_text}`,
        `ASSISTANT: ${assistant_text}`,
      ].join("\n"),
    },
  ];

  const payload: Record<string, unknown> = {
    model: get_openai_memory_model(),
    instructions,
    input,
    // temperature removed - not supported by gpt-5-nano
    text: {
      format: {
        type: "json_schema",
        name: "identity_memory_ingest",
        strict: true,
        schema: MEMORY_SCHEMA,
      },
    },
  };

  const response = await responses_create({ openai, payload });
  const text = extract_response_text(response);

  const parsed = JSON.parse(text) as unknown;
  if (!is_record(parsed)) {
    throw new Error("Structured output is not an object.");
  }

  const conversation_summary =
    typeof parsed["conversation_summary"] === "string"
      ? parsed["conversation_summary"].trim()
      : "";

  const memory_patch_raw = parsed["memory_patch"];
  const memory_patch_obj = is_record(memory_patch_raw) ? memory_patch_raw : {};

  const memory_patch = {
    facts: normalize_string_array(memory_patch_obj["facts"]),
    preferences: normalize_string_array(memory_patch_obj["preferences"]),
    notes: normalize_string_array(memory_patch_obj["notes"]),
  };

  return {
    conversation_summary,
    memory_patch,
  };
};

export const extract_identity_memory_update_batch = async ({
  openai,
  profile_json,
  memory_json,
  recent_summaries_json,
  messages_window_json,
}: {
  openai: OpenAI;
  profile_json: string;
  memory_json: string;
  recent_summaries_json: string;
  messages_window_json: string;
}): Promise<extracted_memory_update_batch> => {
  const instructions = [
    "You extract durable user memory updates + an optional short summary for a social AI.",
    "",
    "WHAT TO SAVE (only these):",
    "- Durable personal facts: name, job/occupation, relationships, family, hometown, pets, significant life events.",
    "- Durable preferences: music taste, food preferences, hobbies, interests, communication style.",
    "- Notes: only meaningful personal context worth remembering long-term (e.g. 'Just moved to Austin').",
    "- Prefer tags_set for simple stable attributes (snake_case keys), e.g. favorite_color = green.",
    "",
    "WHAT TO NEVER SAVE:",
    "- What the user asked the AI to do (tool usage, commands, requests like 'turn on lights', 'play music').",
    "- Conversation topics or what was discussed — that is what the summary field is for.",
    "- Anything about the AI's capabilities, limitations, or responses.",
    "- Transient states ('user is tired', 'user is testing', 'user seems frustrated').",
    "- Technical details about the system, errors, or debugging.",
    "- Anything already present in EXISTING_MEMORY_JSON — do not duplicate.",
    "",
    "OTHER RULES:",
    "- Only extract facts/preferences the user explicitly stated or clearly confirmed.",
    "- Do NOT infer anything from appearance or identity context beyond what is provided.",
    "- Avoid sensitive personal data (medical, financial, biometrics, passwords, illegal activity).",
    "- Output a patch only if there is something genuinely worth saving; otherwise return empty arrays/objects.",
    "- conversation_summary can be empty if the window is trivial.",
    "- When in doubt, save NOTHING. Empty arrays are better than noise.",
    "",
    "Return JSON that matches the provided JSON Schema exactly.",
  ].join("\n");

  const input = [
    {
      role: "user",
      content: [
        "PROFILE_JSON:",
        profile_json,
        "",
        "EXISTING_MEMORY_JSON:",
        memory_json,
        "",
        "RECENT_CONVERSATION_SUMMARIES_JSON:",
        recent_summaries_json,
        "",
        "MESSAGES_WINDOW_JSON (most recent window, user+assistant):",
        messages_window_json,
      ].join("\n"),
    },
  ];

  const payload: Record<string, unknown> = {
    model: get_openai_memory_model(),
    instructions,
    input,
    // temperature removed - not supported by gpt-5-nano
    text: {
      format: {
        type: "json_schema",
        name: "identity_memory_batch_v1",
        strict: true,
        schema: MEMORY_BATCH_SCHEMA,
      },
    },
  };

  const response = await responses_create({ openai, payload });
  const text = extract_response_text(response);

  const parsed = JSON.parse(text) as unknown;
  if (!is_record(parsed)) {
    throw new Error("Structured output is not an object.");
  }

  const conversation_summary =
    typeof parsed["conversation_summary"] === "string"
      ? parsed["conversation_summary"].trim()
      : "";

  const memory_patch_raw = parsed["memory_patch"];
  const memory_patch_obj = is_record(memory_patch_raw) ? memory_patch_raw : {};

  const memory_patch = {
    tags_set: normalize_kv_array(memory_patch_obj["tags_set"]),
    tags_unset: normalize_string_array(memory_patch_obj["tags_unset"]),
    facts_add: normalize_string_array(memory_patch_obj["facts_add"]),
    preferences_add: normalize_string_array(memory_patch_obj["preferences_add"]),
    notes_add: normalize_string_array(memory_patch_obj["notes_add"]),
  };

  return {
    conversation_summary,
    memory_patch,
  };
};

const CLEANUP_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    tags_to_remove: {
      type: "array",
      items: { type: "string", maxLength: 64 },
      maxItems: 80,
    },
    facts_to_remove: {
      type: "array",
      items: { type: "string", maxLength: 220 },
      maxItems: 50,
    },
    preferences_to_remove: {
      type: "array",
      items: { type: "string", maxLength: 220 },
      maxItems: 50,
    },
    notes_to_remove: {
      type: "array",
      items: { type: "string", maxLength: 220 },
      maxItems: 50,
    },
  },
  required: ["tags_to_remove", "facts_to_remove", "preferences_to_remove", "notes_to_remove"],
};

export const analyze_memory_for_cleanup = async ({
  openai,
  memory_json,
}: {
  openai: OpenAI;
  memory_json: string;
}): Promise<memory_cleanup_suggestion> => {
  const instructions = [
    "You are a memory quality auditor for a personal AI assistant.",
    "You will receive the user's EXISTING_MEMORY_JSON containing tags, facts, preferences, and notes.",
    "",
    "Your job: identify items that are NOISE and should be REMOVED.",
    "",
    "REMOVE these kinds of items:",
    "- Descriptions of what the user asked the AI to do (tool usage, commands, requests like 'asked to turn on lights').",
    "- Conversation topics or what was discussed (e.g. 'user talked about music', 'discussed testing features').",
    "- Anything about the AI's capabilities, limitations, or behavior.",
    "- Transient states ('user is tired', 'user was frustrated', 'user is high', 'user was testing').",
    "- Technical details about the system, errors, or debugging.",
    "- Vague or low-value statements that don't reveal durable personal info.",
    "- Duplicates or near-duplicates of other items.",
    "",
    "KEEP these kinds of items:",
    "- Durable personal facts: name, job, relationships, family, hometown, pets, age, significant life events.",
    "- Durable preferences: music taste, food preferences, hobbies, interests, communication style.",
    "- Meaningful personal context worth remembering long-term (e.g. 'Just moved to Austin', 'Expects first child in March').",
    "",
    "For tags_to_remove, return the TAG KEYS (not values) that should be removed.",
    "For facts/preferences/notes_to_remove, return the EXACT strings from the input.",
    "If everything looks clean, return empty arrays.",
    "",
    "Return JSON that matches the provided JSON Schema exactly.",
  ].join("\n");

  const input = [
    {
      role: "user",
      content: ["EXISTING_MEMORY_JSON:", memory_json].join("\n"),
    },
  ];

  const payload: Record<string, unknown> = {
    model: get_openai_memory_model(),
    instructions,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "memory_cleanup_v1",
        strict: true,
        schema: CLEANUP_SCHEMA,
      },
    },
  };

  const response = await responses_create({ openai, payload });
  const text = extract_response_text(response);

  const parsed = JSON.parse(text) as unknown;
  if (!is_record(parsed)) {
    throw new Error("Structured output is not an object.");
  }

  return {
    tags_to_remove: normalize_string_array(parsed["tags_to_remove"]),
    facts_to_remove: normalize_string_array(parsed["facts_to_remove"]),
    preferences_to_remove: normalize_string_array(parsed["preferences_to_remove"]),
    notes_to_remove: normalize_string_array(parsed["notes_to_remove"]),
  };
};

