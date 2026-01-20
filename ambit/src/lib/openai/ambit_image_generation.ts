import type OpenAI from "openai";
import { is_record } from "./openai_responses";

const as_string = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const as_enum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const s = as_string(value) as T;
  return allowed.includes(s) ? s : fallback;
};

export const generate_photo = async ({
  openai,
  prompt,
  size = "1024x1024",
  quality = "high",
}: {
  openai: OpenAI;
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high";
}): Promise<{ image_data_url: string; output_format: "jpeg" }> => {
  const trimmed_prompt = prompt.trim();
  if (!trimmed_prompt) {
    throw new Error("prompt is required");
  }

  const safe_size = as_enum(
    size,
    ["1024x1024", "1024x1536", "1536x1024", "auto"] as const,
    "1024x1024"
  );
  const safe_quality = as_enum(quality, ["low", "medium", "high"] as const, "high");

  const output_format = "jpeg" as const;

  const images_any = openai as unknown as Record<string, unknown>;
  const images = images_any["images"];
  const generate = is_record(images) ? images["generate"] : null;

  if (typeof generate !== "function") {
    throw new Error("OpenAI client is missing images.generate().");
  }

  const response = (await (generate as (...args: unknown[]) => Promise<unknown>).call(
    images,
    {
      model: "gpt-image-1",
      prompt: trimmed_prompt,
      size: safe_size,
      quality: safe_quality,
      output_format,
    }
  )) as unknown;

  if (!is_record(response)) {
    throw new Error("OpenAI images response is not an object.");
  }

  const data = response["data"];
  const first = Array.isArray(data) ? data[0] : null;
  const b64_json = is_record(first) ? first["b64_json"] : null;

  const b64 = typeof b64_json === "string" ? b64_json.trim() : "";
  if (!b64) {
    throw new Error("OpenAI images response missing b64_json.");
  }

  return {
    image_data_url: `data:image/jpeg;base64,${b64}`,
    output_format,
  };
};

