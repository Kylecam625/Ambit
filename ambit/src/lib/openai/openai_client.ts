import OpenAI from "openai";
import https from "https";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export const get_openai_api_key = (): string => {
  const api_key = process.env.OPENAI_API_KEY;

  if (!api_key) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return api_key;
};

export const get_openai_responses_model = (): string => {
  return process.env.OPENAI_RESPONSES_MODEL || "gpt-5-nano";
};

export const get_openai_camera_model = (): string => {
  return process.env.OPENAI_CAMERA_MODEL || "gpt-5-nano";
};

export const get_openai_memory_model = (): string => {
  return process.env.OPENAI_MEMORY_MODEL || "gpt-5-nano";
};

export const get_openai_image_model = (): string => {
  return process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
};

export const build_openai_headers = (): Headers => {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${get_openai_api_key()}`);

  return headers;
};

let openai_client: OpenAI | null = null;

export const get_openai_client = (): OpenAI => {
  if (!openai_client) {
    openai_client = new OpenAI({
      apiKey: get_openai_api_key(),
      // Force IPv4 to avoid slower IPv6 routing on some networks (3x faster on Mac)
      // @ts-expect-error - httpAgent exists in the underlying fetch config but not in types
      httpAgent: new https.Agent({ family: 4 }),
    });
  }
  return openai_client;
};
