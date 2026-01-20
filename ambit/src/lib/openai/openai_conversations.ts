import type OpenAI from "openai";

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalize_id = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
};

export const create_conversation_id = async ({
  openai,
}: {
  openai: OpenAI;
}): Promise<string | null> => {
  const openai_record = openai as unknown as Record<string, unknown>;
  const conversations = openai_record["conversations"];

  if (!is_record(conversations)) {
    return null;
  }

  const create = conversations["create"];

  if (typeof create !== "function") {
    return null;
  }

  try {
    const conversation = await (create as (...args: unknown[]) => Promise<unknown>).call(
      conversations
    );

    if (!is_record(conversation)) {
      return null;
    }

    return normalize_id(conversation["id"]);
  } catch {
    return null;
  }
};

