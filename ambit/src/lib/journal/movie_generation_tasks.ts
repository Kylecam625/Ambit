import { randomUUID } from "crypto";

export type movie_task_progress_step =
  | "splitting_text"
  | "generating_images"
  | "generating_audio"
  | "saving"
  | "complete"
  | "failed";

export type movie_task_status = "queued" | "running" | "succeeded" | "failed";

export type movie_task = {
  task_id: string;
  status: movie_task_status;
  profile_id: string;
  entry_date: string;
  voice_id: string;
  voice_name: string | null;
  movie_id: string | null;
  progress_step: movie_task_progress_step | null;
  progress_message: string;
  images_generated: number;
  images_total: number;
  error: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

const TASK_TTL_MS = 1000 * 60 * 30; // 30 minutes
const MAX_TASKS = 50;

const now_ms = (): number => Date.now();

const is_movie_task_map = (value: unknown): value is Map<string, movie_task> =>
  value instanceof Map;

const get_store = (): Map<string, movie_task> => {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g["__ambit_movie_tasks"];
  if (is_movie_task_map(existing)) return existing;
  const created = new Map<string, movie_task>();
  g["__ambit_movie_tasks"] = created;
  return created;
};

const prune_store = (store: Map<string, movie_task>) => {
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

export const update_movie_task = ({
  task_id,
  patch,
}: {
  task_id: string;
  patch: Partial<movie_task>;
}) => {
  const store = get_store();
  const existing = store.get(task_id);
  if (!existing) return;
  const updated: movie_task = {
    ...existing,
    ...patch,
    updated_at_ms: now_ms(),
  };
  store.set(task_id, updated);
};

export const create_movie_task = ({
  profile_id,
  entry_date,
  voice_id,
  voice_name,
}: {
  profile_id: string;
  entry_date: string;
  voice_id: string;
  voice_name: string | null;
}): movie_task => {
  const store = get_store();
  prune_store(store);

  const task_id = randomUUID();
  const created_at_ms = now_ms();

  const task: movie_task = {
    task_id,
    status: "queued",
    profile_id,
    entry_date,
    voice_id,
    voice_name,
    movie_id: null,
    progress_step: null,
    progress_message: "Queued...",
    images_generated: 0,
    images_total: 5,
    error: null,
    created_at_ms,
    updated_at_ms: created_at_ms,
  };

  store.set(task_id, task);
  return task;
};

export const get_movie_task = ({ task_id }: { task_id: string }): movie_task | null => {
  const trimmed = task_id.trim();
  if (!trimmed) return null;

  const store = get_store();
  prune_store(store);

  const task = store.get(trimmed);
  return task ? { ...task } : null;
};
