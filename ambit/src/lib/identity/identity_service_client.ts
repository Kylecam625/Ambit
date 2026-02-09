import type {
  identity_enrollment,
  identity_profile_bundle,
  identity_profile_summary,
  identity_memory,
  identity_profile,
  identity_generated_image,
  identity_journal_entry,
  identity_journal_entry_summary,
  journal_movie,
  journal_movie_summary,
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
  const start = Date.now();
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const duration_ms = Date.now() - start;
  console.log(
    `[Identity] ${method} ${url} status=${response.status} duration_ms=${duration_ms}`
  );

  const data = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const error_value =
      data && typeof data === "object" && data !== null && "error" in (data as Record<string, unknown>)
        ? (data as { error?: unknown }).error
        : null;
    const message = typeof error_value === "string" ? error_value : `HTTP ${response.status}`;
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
  phone_number = null,
  sms_consent = false,
}: {
  base_url: string;
  name: string;
  age: number | null;
  interests: string;
  phone_number?: string | null;
  sms_consent?: boolean;
}): Promise<identity_profile> => {
  const url = api_url({ base_url, path: "/api/profiles" });
  const data = await fetch_json<{ profile: identity_profile }>({
    url,
    method: "POST",
    body: { name, age, interests, phone_number, sms_consent },
  });
  return data.profile;
};

export const identity_patch_profile = async ({
  base_url,
  profile_id,
  name,
  age,
  interests,
  phone_number,
  sms_consent,
}: {
  base_url: string;
  profile_id: string;
  name: string;
  age: number | null;
  interests: string;
  phone_number: string | null;
  sms_consent: boolean;
}): Promise<identity_profile> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}`,
  });
  const data = await fetch_json<{ profile: identity_profile }>({
    url,
    method: "PATCH",
    body: { name, age, interests, phone_number, sms_consent },
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
  facts = [],
  preferences = [],
  notes = [],
  tags_set = {},
  tags_unset = [],
  facts_remove = [],
  preferences_remove = [],
  notes_remove = [],
}: {
  base_url: string;
  profile_id: string;
  facts?: string[];
  preferences?: string[];
  notes?: string[];
  tags_set?: Record<string, string>;
  tags_unset?: string[];
  facts_remove?: string[];
  preferences_remove?: string[];
  notes_remove?: string[];
}): Promise<identity_memory> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/memory`,
  });
  const data = await fetch_json<{ memory: identity_memory }>({
    url,
    method: "PATCH",
    body: {
      facts,
      preferences,
      notes,
      facts_remove,
      preferences_remove,
      notes_remove,
      tags_set,
      tags_unset,
    },
  });
  return data.memory;
};

export const identity_clear_memory = async ({
  base_url,
  profile_id,
}: {
  base_url: string;
  profile_id: string;
}): Promise<{ ok: boolean; memory: identity_memory }> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/memory`,
  });
  return await fetch_json<{ ok: boolean; memory: identity_memory }>({
    url,
    method: "DELETE",
  });
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

export const identity_list_generated_images = async ({
  base_url,
  profile_id,
  limit = 50,
}: {
  base_url: string;
  profile_id: string;
  limit?: number;
}): Promise<identity_generated_image[]> => {
  const safe_limit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/images?limit=${safe_limit}`,
  });
  const data = await fetch_json<{ images: identity_generated_image[] }>({ url });
  return Array.isArray(data.images) ? data.images : [];
};

export const identity_add_generated_image = async ({
  base_url,
  profile_id,
  prompt,
  image_data_url,
}: {
  base_url: string;
  profile_id: string;
  prompt: string;
  image_data_url: string;
}): Promise<identity_generated_image> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/images`,
  });
  const data = await fetch_json<{ image: identity_generated_image }>({
    url,
    method: "POST",
    body: { prompt, image_data_url },
  });
  return data.image;
};

export const try_identity_healthz = async ({ base_url }: { base_url: string }) => {
  try {
    const data = await identity_healthz({ base_url });
    return { ok: Boolean(data.ok), error: null as string | null };
  } catch (error) {
    return { ok: false, error: as_error_message(error) };
  }
};

// ── Journal endpoints ──

export const identity_list_journal_entries = async ({
  base_url,
  profile_id,
  year,
  month,
}: {
  base_url: string;
  profile_id: string;
  year: number;
  month: number;
}): Promise<identity_journal_entry_summary[]> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal?year=${year}&month=${month}`,
  });
  const data = await fetch_json<{ entries: identity_journal_entry_summary[] }>({ url });
  return Array.isArray(data.entries) ? data.entries : [];
};

export const identity_get_journal_entry = async ({
  base_url,
  profile_id,
  entry_date,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
}): Promise<identity_journal_entry | null> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/${encodeURIComponent(entry_date)}`,
  });
  try {
    const data = await fetch_json<{ entry: identity_journal_entry }>({ url });
    return data.entry ?? null;
  } catch {
    return null;
  }
};

export const identity_create_journal_entry = async ({
  base_url,
  profile_id,
  entry_date,
  content_html,
  content_text,
  qa_transcript,
  mood,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
  content_html: string;
  content_text: string;
  qa_transcript?: Array<{ role: string; content: string }> | null;
  mood?: string | null;
}): Promise<identity_journal_entry> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal`,
  });
  const data = await fetch_json<{ entry: identity_journal_entry }>({
    url,
    method: "POST",
    body: { entry_date, content_html, content_text, qa_transcript, mood },
  });
  return data.entry;
};

export const identity_update_journal_entry = async ({
  base_url,
  profile_id,
  entry_date,
  content_html,
  content_text,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
  content_html: string;
  content_text: string;
}): Promise<identity_journal_entry> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/${encodeURIComponent(entry_date)}`,
  });
  const data = await fetch_json<{ entry: identity_journal_entry }>({
    url,
    method: "PATCH",
    body: { content_html, content_text },
  });
  return data.entry;
};

export const identity_delete_journal_entry = async ({
  base_url,
  profile_id,
  entry_date,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
}): Promise<{ ok: boolean }> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/${encodeURIComponent(entry_date)}`,
  });
  return await fetch_json<{ ok: boolean }>({ url, method: "DELETE" });
};

// ── Journal movie endpoints ──

export const identity_create_journal_movie = async ({
  base_url,
  profile_id,
  entry_date,
  voice_id,
  voice_name,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
  voice_id: string;
  voice_name: string | null;
}): Promise<journal_movie_summary> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/${encodeURIComponent(entry_date)}/movies`,
  });
  const data = await fetch_json<{ movie: journal_movie_summary }>({
    url,
    method: "POST",
    body: { voice_id, voice_name },
  });
  return data.movie;
};

export const identity_complete_journal_movie = async ({
  base_url,
  profile_id,
  movie_id,
  segments_json,
  audio_base64,
  alignment_json,
}: {
  base_url: string;
  profile_id: string;
  movie_id: string;
  segments_json: string;
  audio_base64: string;
  alignment_json: string;
}): Promise<{ movie_id: string; status: string }> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/movies/${encodeURIComponent(movie_id)}/complete`,
  });
  return await fetch_json<{ movie_id: string; status: string }>({
    url,
    method: "PATCH",
    body: { segments_json, audio_base64, alignment_json },
  });
};

export const identity_fail_journal_movie = async ({
  base_url,
  profile_id,
  movie_id,
}: {
  base_url: string;
  profile_id: string;
  movie_id: string;
}): Promise<{ movie_id: string; status: string }> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/movies/${encodeURIComponent(movie_id)}/fail`,
  });
  return await fetch_json<{ movie_id: string; status: string }>({
    url,
    method: "PATCH",
  });
};

export const identity_list_journal_movies = async ({
  base_url,
  profile_id,
  entry_date,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
}): Promise<journal_movie_summary[]> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/${encodeURIComponent(entry_date)}/movies`,
  });
  const data = await fetch_json<{ movies: journal_movie_summary[] }>({ url });
  return Array.isArray(data.movies) ? data.movies : [];
};

export const identity_get_latest_journal_movie = async ({
  base_url,
  profile_id,
  entry_date,
}: {
  base_url: string;
  profile_id: string;
  entry_date: string;
}): Promise<journal_movie | null> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/${encodeURIComponent(entry_date)}/movies/latest`,
  });
  try {
    const data = await fetch_json<{ movie: journal_movie }>({ url });
    return data.movie ?? null;
  } catch {
    return null;
  }
};

export const identity_get_journal_movie = async ({
  base_url,
  profile_id,
  movie_id,
}: {
  base_url: string;
  profile_id: string;
  movie_id: string;
}): Promise<journal_movie | null> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/movies/${encodeURIComponent(movie_id)}`,
  });
  try {
    const data = await fetch_json<{ movie: journal_movie }>({ url });
    return data.movie ?? null;
  } catch {
    return null;
  }
};

export const identity_delete_journal_movie = async ({
  base_url,
  profile_id,
  movie_id,
}: {
  base_url: string;
  profile_id: string;
  movie_id: string;
}): Promise<{ ok: boolean }> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal/movies/${encodeURIComponent(movie_id)}`,
  });
  return await fetch_json<{ ok: boolean }>({ url, method: "DELETE" });
};

export const identity_list_movie_dates = async ({
  base_url,
  profile_id,
  year,
  month,
}: {
  base_url: string;
  profile_id: string;
  year: number;
  month: number;
}): Promise<string[]> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/journal-movie-dates?year=${year}&month=${month}`,
  });
  const data = await fetch_json<{ dates: string[] }>({ url });
  return Array.isArray(data.dates) ? data.dates : [];
};

export const identity_get_enrollment_image = async ({
  base_url,
  profile_id,
}: {
  base_url: string;
  profile_id: string;
}): Promise<string | null> => {
  const url = api_url({
    base_url,
    path: `/api/profiles/${encodeURIComponent(profile_id)}/enrollment-image`,
  });
  try {
    const data = await fetch_json<{ image_data_url: string }>({ url });
    return data.image_data_url ?? null;
  } catch {
    return null;
  }
};

