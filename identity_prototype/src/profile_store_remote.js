import { to_int_or_null, to_string_or_empty } from "./utils.js";

const normalize_base_url = (raw) => to_string_or_empty(raw).trim().replace(/\/+$/, "");

const fetch_json = async ({ url, method = "GET", body }) => {
  const headers = { "Content-Type": "application/json" };
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
};

const normalize_profile = (value, enrollments_override = null) => {
  const profile_id = to_string_or_empty(value?.profile_id).trim();
  if (!profile_id) return null;

  const name = to_string_or_empty(value?.name).trim() || "Unknown";
  const age = to_int_or_null(value?.age);
  const interests = to_string_or_empty(value?.interests).trim();

  const created_at = to_string_or_empty(value?.created_at).trim() || "";
  const updated_at = to_string_or_empty(value?.updated_at).trim() || "";

  const enrollments = Array.isArray(enrollments_override)
    ? enrollments_override
    : Array.isArray(value?.enrollments)
      ? value.enrollments
      : [];
  const normalized_enrollments = enrollments
    .map((e) => {
      const descriptor = Array.isArray(e?.descriptor) ? e.descriptor.map((n) => Number(n) || 0) : null;
      if (!descriptor || descriptor.length < 32) return null;
      return {
        enrollment_id: to_string_or_empty(e?.enrollment_id).trim() || "",
        descriptor,
        image_data_url: typeof e?.image_data_url === "string" ? e.image_data_url : null,
        created_at: to_string_or_empty(e?.created_at).trim() || "",
      };
    })
    .filter(Boolean);

  return { profile_id, name, age, interests, created_at, updated_at, enrollments: normalized_enrollments };
};

export const create_remote_profile_store = ({ base_url }) => {
  const base = normalize_base_url(base_url);

  const api_url = (path) => `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  return {
    mode: "remote",
    base_url: base,

    async healthz() {
      return await fetch_json({ url: api_url("/api/healthz") });
    },

    async list_profiles() {
      const list = await fetch_json({ url: api_url("/api/profiles") });
      const profiles = Array.isArray(list?.profiles) ? list.profiles : [];

      // Fetch full profiles to obtain enrollments (descriptors)
      const full = await Promise.all(
        profiles.map(async (p) => {
          const id = to_string_or_empty(p?.profile_id).trim();
          if (!id) return null;
          const data = await fetch_json({ url: api_url(`/api/profiles/${encodeURIComponent(id)}`) });
          return normalize_profile(data?.profile, data?.enrollments);
        })
      );

      return full.filter(Boolean);
    },

    async get_profile({ profile_id }) {
      const id = to_string_or_empty(profile_id).trim();
      if (!id) return null;
      const data = await fetch_json({ url: api_url(`/api/profiles/${encodeURIComponent(id)}`) });
      return normalize_profile(data?.profile, data?.enrollments);
    },

    async create_profile({ name, age, interests }) {
      const data = await fetch_json({
        url: api_url("/api/profiles"),
        method: "POST",
        body: { name, age, interests },
      });
      return normalize_profile(data?.profile, data?.enrollments);
    },

    async delete_profile({ profile_id }) {
      const id = to_string_or_empty(profile_id).trim();
      if (!id) return { ok: true };
      return await fetch_json({
        url: api_url(`/api/profiles/${encodeURIComponent(id)}`),
        method: "DELETE",
      });
    },

    async add_enrollment({ profile_id, descriptor, image_data_url }) {
      const id = to_string_or_empty(profile_id).trim();
      if (!id) throw new Error("profile_id is required");
      const data = await fetch_json({
        url: api_url(`/api/profiles/${encodeURIComponent(id)}/enroll`),
        method: "POST",
        body: { descriptor, image_data_url },
      });
      return data?.enrollment ?? null;
    },
  };
};

