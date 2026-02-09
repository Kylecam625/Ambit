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

  // ── Journal movie endpoints ──

  // Create a movie record (status=generating, assets filled later)
  router.post("/profiles/:profile_id/journal/:entry_date/movies", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      const entry_date = to_string(req.params.entry_date).trim();
      if (!profile_id || !entry_date) {
        res.status(400).json({ error: "profile_id and entry_date are required" });
        return;
      }

      const voice_id = to_string(req.body?.voice_id).trim();
      const voice_name = to_string(req.body?.voice_name).trim() || null;
      if (!voice_id) {
        res.status(400).json({ error: "voice_id is required" });
        return;
      }

      const movie = repo.create_journal_movie({ profile_id, entry_date, voice_id, voice_name });
      res.json({ movie });
    } catch (error) {
      const message = as_error_message(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  // Complete a movie (fill in assets)
  router.patch("/profiles/:profile_id/journal/movies/:movie_id/complete", (req, res) => {
    try {
      const movie_id = to_string(req.params.movie_id).trim();
      if (!movie_id) {
        res.status(400).json({ error: "movie_id is required" });
        return;
      }

      const segments_json = req.body?.segments_json;
      const audio_base64 = to_string(req.body?.audio_base64);
      const alignment_json = req.body?.alignment_json;

      if (!segments_json || !audio_base64) {
        res.status(400).json({ error: "segments_json and audio_base64 are required" });
        return;
      }

      const result = repo.update_journal_movie_complete({
        movie_id,
        segments_json: typeof segments_json === "string" ? segments_json : JSON.stringify(segments_json),
        audio_base64,
        alignment_json: typeof alignment_json === "string" ? alignment_json : JSON.stringify(alignment_json),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Mark a movie as failed
  router.patch("/profiles/:profile_id/journal/movies/:movie_id/fail", (req, res) => {
    try {
      const movie_id = to_string(req.params.movie_id).trim();
      if (!movie_id) {
        res.status(400).json({ error: "movie_id is required" });
        return;
      }

      const result = repo.update_journal_movie_failed({ movie_id });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // List all movie versions for a date
  router.get("/profiles/:profile_id/journal/:entry_date/movies", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      const entry_date = to_string(req.params.entry_date).trim();
      if (!profile_id || !entry_date) {
        res.status(400).json({ error: "profile_id and entry_date are required" });
        return;
      }

      const movies = repo.list_journal_movies({ profile_id, entry_date });
      res.json({ movies });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Get latest completed movie for a date
  router.get("/profiles/:profile_id/journal/:entry_date/movies/latest", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      const entry_date = to_string(req.params.entry_date).trim();
      if (!profile_id || !entry_date) {
        res.status(400).json({ error: "profile_id and entry_date are required" });
        return;
      }

      const movie = repo.get_latest_journal_movie({ profile_id, entry_date });
      if (!movie) {
        res.status(404).json({ error: "No completed movie found" });
        return;
      }
      res.json({ movie });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Get a specific movie by id
  router.get("/profiles/:profile_id/journal/movies/:movie_id", (req, res) => {
    try {
      const movie_id = to_string(req.params.movie_id).trim();
      if (!movie_id) {
        res.status(400).json({ error: "movie_id is required" });
        return;
      }

      const movie = repo.get_journal_movie({ movie_id });
      if (!movie) {
        res.status(404).json({ error: "Movie not found" });
        return;
      }
      res.json({ movie });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Delete a movie version
  router.delete("/profiles/:profile_id/journal/movies/:movie_id", (req, res) => {
    try {
      const movie_id = to_string(req.params.movie_id).trim();
      if (!movie_id) {
        res.status(400).json({ error: "movie_id is required" });
        return;
      }

      repo.delete_journal_movie({ movie_id });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // List dates with completed movies for a month (calendar indicator)
  router.get("/profiles/:profile_id/journal-movie-dates", (req, res) => {
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

      const dates = repo.list_movie_dates({ profile_id, year, month });
      res.json({ dates });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  // Get first enrollment image for a profile (face photo)
  router.get("/profiles/:profile_id/enrollment-image", (req, res) => {
    try {
      const profile_id = to_string(req.params.profile_id).trim();
      if (!profile_id) {
        res.status(400).json({ error: "profile_id is required" });
        return;
      }

      const image_data_url = repo.get_first_enrollment_image({ profile_id });
      if (!image_data_url) {
        res.status(404).json({ error: "No enrollment image found" });
        return;
      }

      res.json({ image_data_url });
    } catch (error) {
      res.status(500).json({ error: as_error_message(error) });
    }
  });

  return router;
};

module.exports = { create_journal_router };
