import type OpenAI from "openai";
import { is_record } from "./openai_responses";
import { resolve_model, DEFAULT_IMAGE_MODEL } from "@/lib/constants/models";

const as_string = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const as_enum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  const s = as_string(value) as T;
  return allowed.includes(s) ? s : fallback;
};

/**
 * Edit an existing image using OpenAI's image generation with a reference image.
 * Uses the images.edit endpoint when available, falls back to generate with
 * the edit prompt appended to the original prompt.
 */
export const edit_photo = async ({
  openai,
  prompt,
  source_image_data_url,
  size = "1024x1024",
  quality = "medium",
}: {
  openai: OpenAI;
  prompt: string;
  source_image_data_url: string;
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
  const safe_quality = as_enum(quality, ["low", "medium", "high"] as const, "medium");

  const output_format = "jpeg" as const;

  const images_any = openai as unknown as Record<string, unknown>;
  const images = images_any["images"];
  const edit_fn = is_record(images) ? images["edit"] : null;

  if (typeof edit_fn !== "function") {
    // Fallback: regenerate with edit instructions baked into prompt
    const generate_fn = is_record(images) ? images["generate"] : null;
    if (typeof generate_fn !== "function") {
      throw new Error("OpenAI client is missing images.generate() and images.edit().");
    }

    const enhanced_prompt = `Edit the following image: ${trimmed_prompt}. Reference the style and content of the original image.`;

    const start = Date.now();
    const response = (await (generate_fn as (...args: unknown[]) => Promise<unknown>).call(
      images,
      {
        model: resolve_model("OPENAI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL),
        prompt: enhanced_prompt,
        size: safe_size,
        quality: safe_quality,
        output_format,
      }
    )) as unknown;
    const duration_ms = Date.now() - start;
    console.log(`[OpenAI] images.generate (edit fallback) duration_ms=${duration_ms}`);

    if (!is_record(response)) {
      throw new Error("OpenAI images response is not an object.");
    }

    const data = response["data"];
    const first = Array.isArray(data) ? data[0] : null;
    const b64_json = is_record(first) ? first["b64_json"] : null;
    const b64 = typeof b64_json === "string" ? b64_json.trim() : "";
    if (!b64) throw new Error("OpenAI images response missing b64_json.");

    return { image_data_url: `data:image/jpeg;base64,${b64}`, output_format };
  }

  // Extract base64 from data URL for the source image
  const base64_match = source_image_data_url.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!base64_match) {
    throw new Error("Invalid source image data URL format.");
  }

  const mime_type = base64_match[1];
  const extension = mime_type === "image/png" ? "png" : mime_type === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(base64_match[2], "base64");
  const image_file = new File([buffer], `source.${extension}`, { type: mime_type });

  const start = Date.now();
  const response = (await (edit_fn as (...args: unknown[]) => Promise<unknown>).call(
    images,
    {
      model: resolve_model("OPENAI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL),
      prompt: trimmed_prompt,
      image: image_file,
      size: safe_size,
      quality: safe_quality,
      output_format,
    }
  )) as unknown;
  const duration_ms = Date.now() - start;
  console.log(`[OpenAI] images.edit duration_ms=${duration_ms}`);

  if (!is_record(response)) {
    throw new Error("OpenAI images.edit response is not an object.");
  }

  const data = response["data"];
  const first = Array.isArray(data) ? data[0] : null;
  const b64_json = is_record(first) ? first["b64_json"] : null;
  const b64 = typeof b64_json === "string" ? b64_json.trim() : "";
  if (!b64) throw new Error("OpenAI images.edit response missing b64_json.");

  return {
    image_data_url: `data:image/jpeg;base64,${b64}`,
    output_format,
  };
};
