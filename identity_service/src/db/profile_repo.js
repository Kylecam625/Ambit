const { is_record, now_iso, to_int_or_null, to_string, uniq_strings, uuid } = require("../lib/utils");

const DEFAULT_MEMORY = { tags: {}, facts: [], preferences: [], notes: [] };
const MAX_MEMORY_ITEMS_PER_BUCKET = 50;
const MAX_TAGS = 80;

const safe_parse_json = (raw, fallback) => {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "");
    return is_record(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const FACE_DESCRIPTOR_LENGTH = 128;

const normalize_descriptor = (value) => {
  if (!Array.isArray(value)) return null;
  if (value.length !== FACE_DESCRIPTOR_LENGTH) return null;

  const arr = [];
  for (const raw of value) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    arr.push(n);
  }
  return arr;
};

const normalize_profile_row = (row) => {
  if (!row) return null;
  return {
    profile_id: to_string(row.profile_id).trim(),
    name: to_string(row.name).trim() || "Unknown",
    age: row.age === null || row.age === undefined ? null : to_int_or_null(row.age),
    interests: to_string(row.interests).trim(),
    phone_number: to_string(row.phone_number).trim() || null,
    sms_consent: Boolean(row.sms_consent),
    sms_consent_at: to_string(row.sms_consent_at).trim() || null,
    created_at: to_string(row.created_at).trim(),
    updated_at: to_string(row.updated_at).trim(),
  };
};

const normalize_enrollment_row = (row) => {
  if (!row) return null;
  const descriptor = safe_parse_json(row.descriptor_json, null);
  const normalized_descriptor = normalize_descriptor(descriptor);
  if (!normalized_descriptor) return null;

  return {
    enrollment_id: to_string(row.enrollment_id).trim(),
    descriptor: normalized_descriptor,
    image_data_url: typeof row.image_data_url === "string" ? row.image_data_url : null,
    created_at: to_string(row.created_at).trim(),
  };
};

const normalize_memory_row = (row) => {
  if (!row) return DEFAULT_MEMORY;
  const parsed = safe_parse_json(row.memory_json, DEFAULT_MEMORY);
  const tags_obj = is_record(parsed.tags) ? parsed.tags : {};
  const tags = {};
  for (const [raw_key, raw_value] of Object.entries(tags_obj)) {
    const key = to_string(raw_key).trim();
    const value = to_string(raw_value).trim();
    if (!key || !value) continue;
    tags[key] = value;
    if (Object.keys(tags).length >= MAX_TAGS) break;
  }
  const facts = uniq_strings(Array.isArray(parsed.facts) ? parsed.facts : []).slice(0, MAX_MEMORY_ITEMS_PER_BUCKET);
  const preferences = uniq_strings(Array.isArray(parsed.preferences) ? parsed.preferences : []).slice(
    0,
    MAX_MEMORY_ITEMS_PER_BUCKET
  );
  const notes = uniq_strings(Array.isArray(parsed.notes) ? parsed.notes : []).slice(0, MAX_MEMORY_ITEMS_PER_BUCKET);
  return { tags, facts, preferences, notes };
};

const normalize_generated_image_row = (row) => {
  if (!row) return null;
  return {
    image_id: to_string(row.image_id).trim(),
    profile_id: to_string(row.profile_id).trim(),
    prompt: to_string(row.prompt).trim(),
    image_data_url: to_string(row.image_data_url).trim(),
    created_at: to_string(row.created_at).trim(),
  };
};

const merge_memory = ({ current, patch }) => {
  const current_tags = is_record(current?.tags) ? current.tags : {};
  const next_tags = { ...current_tags };

  const tags_set = is_record(patch?.tags_set) ? patch.tags_set : {};
  for (const [raw_key, raw_value] of Object.entries(tags_set)) {
    const key = to_string(raw_key).trim();
    const value = to_string(raw_value).trim();
    if (!key || !value) continue;
    next_tags[key] = value;
  }

  const tags_unset = Array.isArray(patch?.tags_unset) ? patch.tags_unset : [];
  for (const raw_key of tags_unset) {
    const key = to_string(raw_key).trim();
    if (!key) continue;
    delete next_tags[key];
  }

  const tags_entries = Object.entries(next_tags).slice(0, MAX_TAGS);
  const normalized_tags = Object.fromEntries(tags_entries);

  const remove_set = (arr) => {
    const normalized = uniq_strings(Array.isArray(arr) ? arr : [])
      .map((v) => to_string(v).trim())
      .filter(Boolean);
    return new Set(normalized);
  };

  const facts_remove_set = remove_set(patch?.facts_remove);
  const preferences_remove_set = remove_set(patch?.preferences_remove);
  const notes_remove_set = remove_set(patch?.notes_remove);

  const next = {
    tags: normalized_tags,
    facts: uniq_strings([...(current?.facts || []), ...(patch?.facts || [])])
      .filter((s) => !facts_remove_set.has(to_string(s).trim()))
      .slice(0, MAX_MEMORY_ITEMS_PER_BUCKET),
    preferences: uniq_strings([...(current?.preferences || []), ...(patch?.preferences || [])])
      .filter((s) => !preferences_remove_set.has(to_string(s).trim()))
      .slice(0, MAX_MEMORY_ITEMS_PER_BUCKET),
    notes: uniq_strings([...(current?.notes || []), ...(patch?.notes || [])])
      .filter((s) => !notes_remove_set.has(to_string(s).trim()))
      .slice(0, MAX_MEMORY_ITEMS_PER_BUCKET),
  };
  return next;
};

const create_repo = ({ db }) => {
  const insert_profile = db.prepare(
    `
    INSERT INTO profiles (
      profile_id,
      name,
      age,
      interests,
      phone_number,
      sms_consent,
      sms_consent_at,
      created_at,
      updated_at
    )
    VALUES (
      @profile_id,
      @name,
      @age,
      @interests,
      @phone_number,
      @sms_consent,
      @sms_consent_at,
      @created_at,
      @updated_at
    )
  `
  );

  const update_profile = db.prepare(
    `
    UPDATE profiles
    SET
      name = @name,
      age = @age,
      interests = @interests,
      phone_number = @phone_number,
      sms_consent = @sms_consent,
      sms_consent_at = @sms_consent_at,
      updated_at = @updated_at
    WHERE profile_id = @profile_id
  `
  );

  const get_profile = db.prepare(`SELECT * FROM profiles WHERE profile_id = ?`);

  const list_profiles = db.prepare(
    `
    SELECT
      p.profile_id,
      p.name,
      p.age,
      p.interests,
      p.phone_number,
      p.sms_consent,
      p.sms_consent_at,
      p.created_at,
      p.updated_at,
      (SELECT COUNT(1) FROM enrollments e WHERE e.profile_id = p.profile_id) AS descriptor_count
    FROM profiles p
    ORDER BY p.updated_at DESC
  `
  );

  const delete_profile = db.prepare(`DELETE FROM profiles WHERE profile_id = ?`);

  const list_enrollments = db.prepare(
    `
    SELECT enrollment_id, profile_id, descriptor_json, image_data_url, created_at
    FROM enrollments
    WHERE profile_id = ?
    ORDER BY created_at ASC
  `
  );

  const insert_enrollment = db.prepare(
    `
    INSERT INTO enrollments (enrollment_id, profile_id, descriptor_json, image_data_url, created_at)
    VALUES (@enrollment_id, @profile_id, @descriptor_json, @image_data_url, @created_at)
  `
  );

  const touch_profile = db.prepare(`UPDATE profiles SET updated_at = @updated_at WHERE profile_id = @profile_id`);

  const get_memory = db.prepare(`SELECT profile_id, memory_json, updated_at FROM profile_memory WHERE profile_id = ?`);

  const upsert_memory = db.prepare(
    `
    INSERT INTO profile_memory (profile_id, memory_json, updated_at)
    VALUES (@profile_id, @memory_json, @updated_at)
    ON CONFLICT(profile_id) DO UPDATE SET
      memory_json = excluded.memory_json,
      updated_at = excluded.updated_at
  `
  );

  const list_summaries = db.prepare(
    `
    SELECT summary_id, profile_id, conversation_id, summary, started_at, ended_at, created_at
    FROM conversation_summaries
    WHERE profile_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
  );

  const insert_summary = db.prepare(
    `
    INSERT INTO conversation_summaries (summary_id, profile_id, conversation_id, summary, started_at, ended_at, created_at)
    VALUES (@summary_id, @profile_id, @conversation_id, @summary, @started_at, @ended_at, @created_at)
  `
  );

  const insert_generated_image = db.prepare(
    `
    INSERT INTO generated_images (image_id, profile_id, prompt, image_data_url, created_at)
    VALUES (@image_id, @profile_id, @prompt, @image_data_url, @created_at)
  `
  );

  const list_generated_images = db.prepare(
    `
    SELECT image_id, profile_id, prompt, image_data_url, created_at
    FROM generated_images
    WHERE profile_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
  );

  const tx = db.transaction((fn) => fn());

  return {
    list_profiles() {
      const rows = list_profiles.all();
      return rows.map((row) => ({
        ...normalize_profile_row(row),
        descriptor_count: Number(row.descriptor_count) || 0,
      }));
    },

    get_profile({ profile_id }) {
      const row = get_profile.get(profile_id);
      const profile = normalize_profile_row(row);
      if (!profile) return null;

      const enrollments = list_enrollments
        .all(profile_id)
        .map(normalize_enrollment_row)
        .filter(Boolean);

      const memory_row = get_memory.get(profile_id);
      const memory = normalize_memory_row(memory_row);

      const summaries = list_summaries.all(profile_id, 20).map((s) => ({
        summary_id: to_string(s.summary_id).trim(),
        profile_id: to_string(s.profile_id).trim(),
        conversation_id: to_string(s.conversation_id).trim() || null,
        summary: to_string(s.summary).trim(),
        started_at: to_string(s.started_at).trim() || null,
        ended_at: to_string(s.ended_at).trim() || null,
        created_at: to_string(s.created_at).trim(),
      }));

      return { profile, enrollments, memory, conversation_summaries: summaries };
    },

    create_profile({ name, age, interests, phone_number = null, sms_consent = false }) {
      const profile_id = uuid();
      const created_at = now_iso();
      const normalized_phone = to_string(phone_number).trim() || null;
      const did_consent = Boolean(sms_consent);

      if (normalized_phone && !did_consent) {
        throw new Error("sms_consent is required when providing a phone_number");
      }
      if (did_consent && !normalized_phone) {
        throw new Error("phone_number is required when sms_consent is true");
      }

      insert_profile.run({
        profile_id,
        name: to_string(name).trim() || "Unknown",
        age: to_int_or_null(age),
        interests: to_string(interests).trim(),
        phone_number: normalized_phone,
        sms_consent: did_consent ? 1 : 0,
        sms_consent_at: did_consent ? created_at : null,
        created_at,
        updated_at: created_at,
      });

      // Seed memory row
      upsert_memory.run({
        profile_id,
        memory_json: JSON.stringify(DEFAULT_MEMORY),
        updated_at: created_at,
      });

      return this.get_profile({ profile_id });
    },

    update_profile({ profile_id, name, age, interests, phone_number, sms_consent }) {
      const normalized_profile_id = to_string(profile_id).trim();
      if (!normalized_profile_id) {
        throw new Error("profile_id is required");
      }

      return tx(() => {
        const current_row = get_profile.get(normalized_profile_id);
        const current = normalize_profile_row(current_row);
        if (!current) {
          throw new Error("Profile not found");
        }

        const has_name = name !== undefined;
        const has_age = age !== undefined;
        const has_interests = interests !== undefined;
        const has_phone_number = phone_number !== undefined;
        const has_sms_consent = sms_consent !== undefined;

        const next_name = has_name ? to_string(name).trim() : current.name;
        if (has_name && !next_name) {
          throw new Error("name is required");
        }

        const next_age = has_age ? to_int_or_null(age) : current.age;
        const next_interests = has_interests ? to_string(interests).trim() : current.interests;
        const next_phone_number = has_phone_number
          ? to_string(phone_number).trim() || null
          : current.phone_number;
        const next_sms_consent = has_sms_consent ? Boolean(sms_consent) : current.sms_consent;

        if (next_phone_number && !next_sms_consent) {
          throw new Error("sms_consent is required when providing a phone_number");
        }
        if (next_sms_consent && !next_phone_number) {
          throw new Error("phone_number is required when sms_consent is true");
        }

        const updated_at = now_iso();
        const next_sms_consent_at = !next_sms_consent
          ? null
          : !current.sms_consent && next_sms_consent
            ? updated_at
            : current.sms_consent_at;

        update_profile.run({
          profile_id: normalized_profile_id,
          name: next_name || "Unknown",
          age: next_age,
          interests: next_interests,
          phone_number: next_phone_number,
          sms_consent: next_sms_consent ? 1 : 0,
          sms_consent_at: next_sms_consent_at,
          updated_at,
        });

        return this.get_profile({ profile_id: normalized_profile_id });
      });
    },

    delete_profile({ profile_id }) {
      return tx(() => {
        delete_profile.run(profile_id);
        return { ok: true };
      });
    },

    add_enrollment({ profile_id, descriptor, image_data_url }) {
      const normalized_descriptor = normalize_descriptor(descriptor);
      if (!normalized_descriptor) {
        throw new Error(`Invalid descriptor (expected ${FACE_DESCRIPTOR_LENGTH} finite numbers)`);
      }

      const created_at = now_iso();
      const enrollment = {
        enrollment_id: uuid(),
        profile_id,
        descriptor_json: JSON.stringify(normalized_descriptor),
        image_data_url: typeof image_data_url === "string" ? image_data_url : null,
        created_at,
      };

      return tx(() => {
        const profile = get_profile.get(profile_id);
        if (!profile) {
          throw new Error("Profile not found");
        }

        insert_enrollment.run(enrollment);
        touch_profile.run({ profile_id, updated_at: created_at });

        return normalize_enrollment_row(enrollment);
      });
    },

    upsert_memory_patch({ profile_id, patch }) {
      const row = get_memory.get(profile_id);
      const current = normalize_memory_row(row);
      const next = merge_memory({ current, patch });
      const updated_at = now_iso();

      upsert_memory.run({
        profile_id,
        memory_json: JSON.stringify(next),
        updated_at,
      });

      touch_profile.run({ profile_id, updated_at });

      return next;
    },

    add_conversation_summary({ profile_id, conversation_id, summary, started_at, ended_at }) {
      const created_at = now_iso();
      const record = {
        summary_id: uuid(),
        profile_id,
        conversation_id: conversation_id ? to_string(conversation_id).trim() : null,
        summary: to_string(summary).trim(),
        started_at: started_at ? to_string(started_at).trim() : null,
        ended_at: ended_at ? to_string(ended_at).trim() : null,
        created_at,
      };

      if (!record.summary) {
        throw new Error("summary is required");
      }

      return tx(() => {
        const profile = get_profile.get(profile_id);
        if (!profile) throw new Error("Profile not found");
        insert_summary.run(record);
        touch_profile.run({ profile_id, updated_at: created_at });
        return record;
      });
    },

    add_generated_image({ profile_id, prompt, image_data_url }) {
      const created_at = now_iso();
      const record = {
        image_id: uuid(),
        profile_id: to_string(profile_id).trim(),
        prompt: to_string(prompt).trim(),
        image_data_url: to_string(image_data_url).trim(),
        created_at,
      };

      if (!record.profile_id) {
        throw new Error("Profile not found");
      }
      if (!record.prompt) {
        throw new Error("prompt is required");
      }
      if (!record.image_data_url) {
        throw new Error("image_data_url is required");
      }

      return tx(() => {
        const profile = get_profile.get(record.profile_id);
        if (!profile) throw new Error("Profile not found");

        insert_generated_image.run(record);
        touch_profile.run({ profile_id: record.profile_id, updated_at: created_at });

        return normalize_generated_image_row(record);
      });
    },

    list_generated_images({ profile_id, limit = 50 }) {
      const normalized_profile_id = to_string(profile_id).trim();
      if (!normalized_profile_id) return [];

      const parsed_limit = to_int_or_null(limit);
      const safe_limit = parsed_limit && parsed_limit > 0 ? Math.min(parsed_limit, 200) : 50;

      const rows = list_generated_images.all(normalized_profile_id, safe_limit);
      return rows.map(normalize_generated_image_row).filter(Boolean);
    },
  };
};

module.exports = { create_repo };

