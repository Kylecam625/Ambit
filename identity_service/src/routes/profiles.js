const express = require("express");
const { is_record, to_int_or_null, to_string, uniq_strings } = require("../lib/utils");

const as_error_message = (error) => (error instanceof Error ? error.message : "Unknown error");

const create_profiles_router = ({ repo }) => {
  const router = express.Router();

  router.get("/profiles", (_req, res) => {
    const profiles = repo.list_profiles();
    res.json({ profiles });
  });

  router.post("/profiles", (req, res) => {
    try {
      const name = to_string(req.body?.name).trim();
      const age = to_int_or_null(req.body?.age);
      const interests = uniq_strings(
        to_string(req.body?.interests)
          .split(",")
          .map((s) => s.trim())
      ).join(", ");
      const phone_number_raw = to_string(req.body?.phone_number).trim();
      const phone_number = phone_number_raw ? phone_number_raw : null;
      const sms_consent_raw = req.body?.sms_consent;
      const sms_consent =
        sms_consent_raw === true ||
        sms_consent_raw === 1 ||
        sms_consent_raw === "1" ||
        String(sms_consent_raw || "").trim().toLowerCase() === "true";

      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      if (phone_number && !sms_consent) {
        res.status(400).json({ error: "sms_consent is required when providing a phone_number" });
        return;
      }
      if (sms_consent && !phone_number) {
        res.status(400).json({ error: "phone_number is required when sms_consent is true" });
        return;
      }

      const created = repo.create_profile({ name, age, interests, phone_number, sms_consent });
      res.json({ profile: created.profile });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  router.patch("/profiles/:profile_id", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const body = is_record(req.body) ? req.body : {};
      const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

      const name = has("name") ? to_string(body.name).trim() : undefined;
      const age = has("age") ? to_int_or_null(body.age) : undefined;
      const interests = has("interests")
        ? uniq_strings(
            to_string(body.interests)
              .split(",")
              .map((s) => s.trim())
          ).join(", ")
        : undefined;

      const phone_number_raw = has("phone_number") ? to_string(body.phone_number).trim() : undefined;
      const phone_number =
        phone_number_raw === undefined ? undefined : phone_number_raw ? phone_number_raw : null;

      const sms_consent = (() => {
        if (!has("sms_consent")) return undefined;
        const raw = body.sms_consent;
        return (
          raw === true ||
          raw === 1 ||
          raw === "1" ||
          String(raw || "").trim().toLowerCase() === "true"
        );
      })();

      const updated = repo.update_profile({ profile_id, name, age, interests, phone_number, sms_consent });
      res.json({ profile: updated.profile });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.get("/profiles/:profile_id", (req, res) => {
    const profile_id = to_string(req.params.profile_id).trim();
    if (!profile_id) {
      res.status(400).json({ error: "profile_id is required" });
      return;
    }

    const result = repo.get_profile({ profile_id });
    if (!result) {
      res.status(404).json({ error: "profile not found" });
      return;
    }

    res.json(result);
  });

  router.delete("/profiles/:profile_id", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const result = repo.delete_profile({ profile_id });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  router.post("/profiles/:profile_id/enroll", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const descriptor = Array.isArray(req.body?.descriptor) ? req.body.descriptor : null;
      const image_data_url = typeof req.body?.image_data_url === "string" ? req.body.image_data_url : null;

      const enrollment = repo.add_enrollment({ profile_id, descriptor, image_data_url });
      res.json({ enrollment });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.patch("/profiles/:profile_id/memory", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const raw_tags_set = req.body?.tags_set;
      const tags_set = {};
      if (is_record(raw_tags_set)) {
        for (const [raw_key, raw_value] of Object.entries(raw_tags_set)) {
          const key = to_string(raw_key).trim();
          const value = to_string(raw_value).trim();
          if (!key || !value) continue;
          tags_set[key] = value;
        }
      }

      const tags_unset = Array.isArray(req.body?.tags_unset)
        ? req.body.tags_unset.map((v) => to_string(v).trim()).filter(Boolean)
        : [];

      const patch = {
        facts: Array.isArray(req.body?.facts) ? req.body.facts : [],
        preferences: Array.isArray(req.body?.preferences) ? req.body.preferences : [],
        notes: Array.isArray(req.body?.notes) ? req.body.notes : [],
        facts_remove: Array.isArray(req.body?.facts_remove) ? req.body.facts_remove : [],
        preferences_remove: Array.isArray(req.body?.preferences_remove) ? req.body.preferences_remove : [],
        notes_remove: Array.isArray(req.body?.notes_remove) ? req.body.notes_remove : [],
        tags_set,
        tags_unset,
      };

      const memory = repo.upsert_memory_patch({ profile_id, patch });
      res.json({ memory });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.delete("/profiles/:profile_id/memory", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const result = repo.clear_memory({ profile_id });
      res.json(result);
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.post("/profiles/:profile_id/conversations", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const summary = to_string(req.body?.summary).trim();
      const started_at = typeof req.body?.started_at === "string" ? req.body.started_at : null;
      const ended_at = typeof req.body?.ended_at === "string" ? req.body.ended_at : null;
      const conversation_id = typeof req.body?.conversation_id === "string" ? req.body.conversation_id : null;

      const record = repo.add_conversation_summary({
        profile_id,
        conversation_id,
        summary,
        started_at,
        ended_at,
      });

      res.json({ summary: record });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.get("/profiles/:profile_id/images", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const limit = to_int_or_null(req.query?.limit);
      const images = repo.list_generated_images({ profile_id, limit: limit || 50 });
      res.json({ images });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  router.post("/profiles/:profile_id/images", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const prompt = to_string(req.body?.prompt).trim();
      const image_data_url = to_string(req.body?.image_data_url).trim();

      if (!prompt) {
        res.status(400).json({ error: "prompt is required" });
        return;
      }

      if (!image_data_url) {
        res.status(400).json({ error: "image_data_url is required" });
        return;
      }

      const image = repo.add_generated_image({ profile_id, prompt, image_data_url });
      res.json({ image });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  return router;
};

module.exports = { create_profiles_router };

