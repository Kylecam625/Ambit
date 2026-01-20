import { is_record, now_iso, to_int_or_null, to_string_or_empty, uniq_strings, uuid } from "./utils.js";

const STORAGE_KEY = "identity_prototype.store.v1";

const default_db = () => ({
  version: 1,
  profiles: {},
});

const read_db = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return default_db();
    const parsed = JSON.parse(raw);
    if (!is_record(parsed)) return default_db();
    if (!is_record(parsed.profiles)) return default_db();
    return { version: 1, profiles: parsed.profiles };
  } catch {
    return default_db();
  }
};

const write_db = (db) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

const normalize_profile = (profile) => {
  const profile_id = to_string_or_empty(profile?.profile_id).trim();
  if (!profile_id) return null;

  const name = to_string_or_empty(profile?.name).trim() || "Unknown";
  const age = to_int_or_null(profile?.age);
  const interests = uniq_strings(
    to_string_or_empty(profile?.interests)
      .split(",")
      .map((s) => s.trim())
  ).join(", ");

  const enrollments = Array.isArray(profile?.enrollments) ? profile.enrollments : [];
  const normalized_enrollments = enrollments
    .map((e) => {
      if (!is_record(e)) return null;
      const enrollment_id = to_string_or_empty(e.enrollment_id).trim() || uuid();
      const descriptor = Array.isArray(e.descriptor) ? e.descriptor.map((n) => Number(n) || 0) : null;
      if (!descriptor || descriptor.length < 32) return null;
      const image_data_url = typeof e.image_data_url === "string" ? e.image_data_url : null;
      const created_at = to_string_or_empty(e.created_at).trim() || now_iso();
      return { enrollment_id, descriptor, image_data_url, created_at };
    })
    .filter(Boolean);

  const created_at = to_string_or_empty(profile?.created_at).trim() || now_iso();
  const updated_at = to_string_or_empty(profile?.updated_at).trim() || now_iso();

  return { profile_id, name, age, interests, created_at, updated_at, enrollments: normalized_enrollments };
};

export const create_local_profile_store = () => {
  return {
    mode: "local",

    async healthz() {
      return { ok: true, mode: "local" };
    },

    async list_profiles() {
      const db = read_db();
      const profiles = Object.values(db.profiles)
        .map((p) => normalize_profile(p))
        .filter(Boolean);

      // sort by updated_at desc
      profiles.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      return profiles;
    },

    async get_profile({ profile_id }) {
      const db = read_db();
      const profile = normalize_profile(db.profiles[profile_id]);
      if (!profile) return null;
      return profile;
    },

    async create_profile({ name, age, interests }) {
      const db = read_db();
      const profile_id = uuid();
      const created_at = now_iso();

      db.profiles[profile_id] = {
        profile_id,
        name: to_string_or_empty(name).trim() || "Unknown",
        age: to_int_or_null(age),
        interests: to_string_or_empty(interests).trim(),
        created_at,
        updated_at: created_at,
        enrollments: [],
      };

      write_db(db);
      return normalize_profile(db.profiles[profile_id]);
    },

    async delete_profile({ profile_id }) {
      const db = read_db();
      delete db.profiles[profile_id];
      write_db(db);
      return { ok: true };
    },

    async add_enrollment({ profile_id, descriptor, image_data_url }) {
      const db = read_db();
      const profile = normalize_profile(db.profiles[profile_id]);
      if (!profile) throw new Error("Profile not found");

      const enrollment = {
        enrollment_id: uuid(),
        descriptor: Array.isArray(descriptor) ? descriptor.map((n) => Number(n) || 0) : [],
        image_data_url: typeof image_data_url === "string" ? image_data_url : null,
        created_at: now_iso(),
      };

      if (enrollment.descriptor.length < 32) {
        throw new Error("Invalid descriptor");
      }

      const next = {
        ...profile,
        enrollments: [...profile.enrollments, enrollment],
        updated_at: now_iso(),
      };

      db.profiles[profile_id] = next;
      write_db(db);
      return enrollment;
    },
  };
};

