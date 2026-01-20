import type {
  identity_enrollment,
  identity_profile_bundle,
  identity_profile_summary,
  identity_memory,
  identity_profile,
} from "./identity_types";

const normalize_base_url = (raw: string): string => raw.trim().replace(/\/+$/, "");

const api_url = ({ base_url, path }: { base_url: string; path: string }): string => {
  const base = normalize_base_url(base_url);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
};

const as_error_message = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const fetch_json = async <T>({
  url,
  method = "GET",
  body,
}: {
  url: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const message =
      typeof (data as any)?.error === "string"
        ? String((data as any).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!data) {
    throw new Error("Empty response.");
  }

  return data;
};

export const identity_healthz = async ({ base_url }: { base_url: string }) => {
  const url = api_url({ base_url, path: "/api/healthz" });
  return await fetch_json<{ ok: boolean; service: string; time: string }>({ url });
};

export const identity_list_profiles = async ({
  base_url,
}: {
  base_url: string;
}): Promise<identity_profile_summary[]> => {
  const url = api_url({ base_url, path: "/api/profiles" });
  const data = await fetch_json<{ profiles: identity_profile_summary[] }>({ url });
  return Array.isArray(data.profiles) ? data.profiles : [];
};

export const identity_get_profile = async ({
  base_url,
  profile_id,
}: {
  base_url: string;
  profile_id: string;
}): Promise<identity_profile_bundle> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}`,
  });
  return await fetch_json<identity_profile_bundle>({ url });
};

export const identity_create_profile = async ({
  base_url,
  name,
  age,
  interests,
}: {
  base_url: string;
  name: string;
  age: number | null;
  interests: string;
}): Promise<identity_profile> => {
  const url = api_url({ base_url, path: "/api/profiles" });
  const data = await fetch_json<{ profile: identity_profile }>({
    url,
    method: "POST",
    body: { name, age, interests },
  });
  return data.profile;
};

export const identity_delete_profile = async ({
  base_url,
  profile_id,
}: {
  base_url: string;
  profile_id: string;
}): Promise<{ ok: boolean }> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}`,
  });
  return await fetch_json<{ ok: boolean }>({ url, method: "DELETE" });
};

export const identity_add_enrollment = async ({
  base_url,
  profile_id,
  descriptor,
  image_data_url,
}: {
  base_url: string;
  profile_id: string;
  descriptor: number[];
  image_data_url: string | null;
}): Promise<identity_enrollment> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/enroll`,
  });
  const data = await fetch_json<{ enrollment: identity_enrollment }>({
    url,
    method: "POST",
    body: { descriptor, image_data_url },
  });
  return data.enrollment;
};

export const identity_patch_memory = async ({
  base_url,
  profile_id,
  facts,
  preferences,
  notes,
  tags_set = {},
  tags_unset = [],
}: {
  base_url: string;
  profile_id: string;
  facts: string[];
  preferences: string[];
  notes: string[];
  tags_set?: Record<string, string>;
  tags_unset?: string[];
}): Promise<identity_memory> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/memory`,
  });
  const data = await fetch_json<{ memory: identity_memory }>({
    url,
    method: "PATCH",
    body: { facts, preferences, notes, tags_set, tags_unset },
  });
  return data.memory;
};

export const identity_add_conversation_summary = async ({
  base_url,
  profile_id,
  summary,
  started_at,
  ended_at,
  conversation_id,
}: {
  base_url: string;
  profile_id: string;
  summary: string;
  started_at: string | null;
  ended_at: string | null;
  conversation_id: string | null;
}) => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/conversations`,
  });
  return await fetch_json<{ summary: unknown }>({
    url,
    method: "POST",
    body: { summary, started_at, ended_at, conversation_id },
  });
};

export const try_identity_healthz = async ({ base_url }: { base_url: string }) => {
  try {
    const data = await identity_healthz({ base_url });
    return { ok: Boolean(data.ok), error: null as string | null };
  } catch (error) {
    return { ok: false, error: as_error_message(error) };
  }
};

