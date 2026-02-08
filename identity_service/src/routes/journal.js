const express = require("express");
const { to_string, to_int_or_null } = require("../lib/utils");

const as_error_message = (error) => (error instanceof Error ? error.message : "Unknown error");

const create_journal_router = ({ repo }) => {
  const router = express.Router();

  // List journal entries for a calendar month (lightweight — no HTML content)
  router.get("/profiles/:profile_id/journal", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const year = to_int_or_null(req.query?.year);
      const month = to_int_or_null(req.query?.month);
      if (!year || !month) {
        res.status(400).json({ error: "year and month query params are required" });
        return;
      }

      const entries = repo.list_journal_entries({ profile_id, year, month });
      res.json({ entries });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Get a full journal entry by date
  router.get("/profiles/:profile_id/journal/:entry_date", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      const entry_date = to_string(req.params.entry_date).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }
      if (!entry_date) {
        res.status(400).json({ error: "entry_date is required" });
        return;
      }

      const entry = repo.get_journal_entry({ profile_id, entry_date });
      if (!entry) {
        res.status(404).json({ error: "journal entry not found" });
        return;
      }

      res.json({ entry });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Create a new journal entry
  router.post("/profiles/:profile_id/journal", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const entry_date = to_string(req.body?.entry_date).trim();
      if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
        res.status(400).json({ error: "entry_date (YYYY-MM-DD) is required" });
        return;
      }

      const content_html = to_string(req.body?.content_html);
      const content_text = to_string(req.body?.content_text);
      const qa_transcript = Array.isArray(req.body?.qa_transcript) ? req.body.qa_transcript : null;
      const mood = to_string(req.body?.mood).trim() || null;

      const entry = repo.create_journal_entry({
        profile_id,
        entry_date,
        content_html,
        content_text,
        qa_transcript,
        mood,
      });

      res.json({ entry });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  // Update an existing journal entry (content only)
  router.patch("/profiles/:profile_id/journal/:entry_date", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      const entry_date = to_string(req.params.entry_date).trim();
      if (!profile_id || !entry_date) {
        res.status(400).json({ error: "profile_id and entry_date are required" });
        return;
      }

      const existing = repo.get_journal_entry({ profile_id, entry_date });
      if (!existing) {
        res.status(404).json({ error: "journal entry not found" });
        return;
      }

      const content_html = to_string(req.body?.content_html);
      const content_text = to_string(req.body?.content_text);

      const result = repo.update_journal_entry({
        entry_id: existing.entry_id,
        content_html,
        content_text,
      });

      res.json({ entry: { ...existing, content_html, content_text, updated_at: result.updated_at } });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  // Delete a journal entry
  router.delete("/profiles/:profile_id/journal/:entry_date", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      const entry_date = to_string(req.params.entry_date).trim();
      if (!profile_id || !entry_date) {
        res.status(400).json({ error: "profile_id and entry_date are required" });
        return;
      }

      const existing = repo.get_journal_entry({ profile_id, entry_date });
      if (!existing) {
        res.status(404).json({ error: "journal entry not found" });
        return;
      }

      repo.delete_journal_entry({ entry_id: existing.entry_id });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  return router;
};

module.exports = { create_journal_router };
