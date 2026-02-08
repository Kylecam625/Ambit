import OpenAI from "openai";
import dns from "dns";
import {
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_CAMERA_MODEL,
  DEFAULT_MEMORY_MODEL,
  DEFAULT_IMAGE_MODEL,
  resolve_model,
} from "@/lib/constants/models";

// Force IPv4 DNS resolution globally -- macOS tries IPv6 first which adds
// 200-500ms per request when the host only has A (IPv4) records.
dns.setDefaultResultOrder("ipv4first");

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export const get_openai_api_key = (): string => {
  const api_key = process.env.OPENAI_API_KEY;
  if (!api_key) throw new Error("OPENAI_API_KEY is not set");
  return api_key;
};

export const get_openai_responses_model = (): string =>
  resolve_model("OPENAI_RESPONSES_MODEL", DEFAULT_RESPONSES_MODEL);

export const get_openai_camera_model = (): string =>
  resolve_model("OPENAI_CAMERA_MODEL", DEFAULT_CAMERA_MODEL);

export const get_openai_memory_model = (): string =>
  resolve_model("OPENAI_MEMORY_MODEL", DEFAULT_MEMORY_MODEL);

export const get_openai_image_model = (): string =>
  resolve_model("OPENAI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL);

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
      // Use a custom fetch wrapper that sets keepalive and Connection header
      // to reuse TCP+TLS connections. Without this, every request opens a new
      // socket which adds ~100-300ms on macOS.
      fetch: (url: RequestInfo | URL, init?: RequestInit) => {
        return globalThis.fetch(url, {
          ...init,
          keepalive: true,
          headers: {
            ...Object.fromEntries(
              init?.headers instanceof Headers
                ? init.headers.entries()
                : Object.entries(init?.headers ?? {})
            ),
            Connection: "keep-alive",
          },
        });
      },
    });
  }
  return openai_client;
};
