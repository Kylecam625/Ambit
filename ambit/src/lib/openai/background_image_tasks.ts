import { randomUUID } from "crypto";
import { identity_add_generated_image } from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { generate_photo } from "./ambit_image_generation";
import { get_openai_client, get_openai_image_model } from "./openai_client";

export type image_task_status = "queued" | "running" | "succeeded" | "failed";

export type image_task = {
  task_id: string;
  status: image_task_status;
  prompt: string;
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality: "low" | "medium" | "high";
  profile_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  completed_at_ms: number | null;
  partial_image_data_url: string | null;
  partial_image_index: number | null;
  image_data_url: string | null;
  image_saved_to_profile: boolean;
  error: string | null;
};

const TASK_TTL_MS = 1000 * 60 * 30; // 30 minutes
const MAX_TASKS = 100;

const now_ms = (): number => Date.now();

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const is_async_iterable = (value: unknown): value is AsyncIterable<unknown> => {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  return Symbol.asyncIterator in (value as object);
};

const to_image_mime = (output_format: string): string => {
  const f = output_format.trim().toLowerCase();
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  return "image/jpeg";
};

const is_image_task_map = (value: unknown): value is Map<string, image_task> =>
  value instanceof Map;

const get_store = (): Map<string, image_task> => {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g["__ambit_image_tasks"];
  if (is_image_task_map(existing)) return existing;
  const created = new Map<string, image_task>();
  g["__ambit_image_tasks"] = created;
  return created;
};

const prune_store = (store: Map<string, image_task>) => {
  const cutoff = now_ms() - TASK_TTL_MS;

  for (const [task_id, task] of store.entries()) {
    if (task.updated_at_ms < cutoff) {
      store.delete(task_id);
    }
  }

  if (store.size <= MAX_TASKS) return;

  const ordered = Array.from(store.entries()).sort(
    (a, b) => a[1].updated_at_ms - b[1].updated_at_ms
  );
  const excess = store.size - MAX_TASKS;
  for (const [task_id] of ordered.slice(0, excess)) {
    store.delete(task_id);
  }
};

const update_task = ({
  store,
  task_id,
  patch,
}: {
  store: Map<string, image_task>;
  task_id: string;
  patch: Partial<image_task>;
}) => {
  const existing = store.get(task_id);
  if (!existing) return;
  const updated: image_task = {
    ...existing,
    ...patch,
    updated_at_ms: now_ms(),
  };
  store.set(task_id, updated);
};

export const start_background_generate_photo_task = ({
  prompt,
  size = "1024x1024",
  quality = "high",
  profile_id = null,
}: {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high";
  profile_id?: string | null;
}): { task_id: string } => {
  const trimmed_prompt = prompt.trim();
  if (!trimmed_prompt) {
    throw new Error("prompt is required");
  }

  const store = get_store();
  prune_store(store);

  const task_id = randomUUID();
  const created_at_ms = now_ms();

  store.set(task_id, {
    task_id,
    status: "queued",
    prompt: trimmed_prompt,
    size,
    quality,
    profile_id,
    created_at_ms,
    updated_at_ms: created_at_ms,
    completed_at_ms: null,
    partial_image_data_url: null,
    partial_image_index: null,
    image_data_url: null,
    image_saved_to_profile: false,
    error: null,
  });

  void (async () => {
    try {
      update_task({ store, task_id, patch: { status: "running" } });

      const openai = get_openai_client();
      let image_data_url: string | null = null;
      let output_format: string = "jpeg";

      // Prefer streaming so we can expose partial previews during generation.
      try {
        const openai_any = openai as unknown as Record<string, unknown>;
        const images = openai_any["images"];
        const generate = is_record(images) ? images["generate"] : null;

        if (typeof generate === "function") {
          const stream = await (generate as (...args: unknown[]) => Promise<unknown>).call(images, {
            model: get_openai_image_model(),
            prompt: trimmed_prompt,
            size,
            quality,
            output_format: "jpeg",
            stream: true,
            partial_images: 2,
          });

          if (is_async_iterable(stream)) {
            for await (const event of stream) {
              if (!is_record(event)) continue;
              const type = typeof event["type"] === "string" ? event["type"] : "";
              const b64 = typeof event["b64_json"] === "string" ? event["b64_json"].trim() : "";
              const fmt =
                typeof event["output_format"] === "string" ? event["output_format"].trim() : "jpeg";

              if (type === "image_generation.partial_image") {
                const partial_idx =
                  typeof event["partial_image_index"] === "number" &&
                  Number.isFinite(event["partial_image_index"])
                    ? Math.max(0, Math.floor(event["partial_image_index"]))
                    : 0;

                if (b64) {
                  update_task({
                    store,
                    task_id,
                    patch: {
                      partial_image_index: partial_idx,
                      partial_image_data_url: `data:${to_image_mime(fmt)};base64,${b64}`,
                    },
                  });
                }
                continue;
              }

              if (type === "image_generation.completed") {
                if (b64) {
                  output_format = fmt || output_format;
                  image_data_url = `data:${to_image_mime(output_format)};base64,${b64}`;
                }
                break;
              }
            }
          }
        }
      } catch (error) {
        console.warn("[ImageTask] Streaming image generation failed; falling back.", error);
      }

      if (!image_data_url) {
        const generated = await generate_photo({ openai, prompt: trimmed_prompt, size, quality });
        image_data_url = generated.image_data_url;
        output_format = generated.output_format;
      }

      if (!image_data_url) {
        throw new Error("Image generation returned no image data.");
      }

      let did_save = false;
      if (profile_id) {
        try {
          const base_url = get_identity_service_url();
          await identity_add_generated_image({
            base_url,
            profile_id,
            prompt: trimmed_prompt,
            image_data_url,
          });
          did_save = true;
        } catch {
          did_save = false;
        }
      }

      update_task({
        store,
        task_id,
        patch: {
          status: "succeeded",
          completed_at_ms: now_ms(),
          image_data_url,
          image_saved_to_profile: did_save,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      update_task({
        store,
        task_id,
        patch: {
          status: "failed",
          completed_at_ms: now_ms(),
          error: message || "Image generation failed.",
        },
      });
    }
  })();

  return { task_id };
};

export const get_image_task = ({ task_id }: { task_id: string }): image_task | null => {
  const trimmed = task_id.trim();
  if (!trimmed) return null;

  const store = get_store();
  prune_store(store);

  const task = store.get(trimmed);
  return task ? { ...task } : null;
};

