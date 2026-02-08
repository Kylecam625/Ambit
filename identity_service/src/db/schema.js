const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS profiles (
  profile_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  interests TEXT,
  phone_number TEXT,
  sms_consent INTEGER NOT NULL DEFAULT 0,
  sms_consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  image_data_url TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_enrollments_profile_id ON enrollments(profile_id);

CREATE TABLE IF NOT EXISTS profile_memory (
  profile_id TEXT PRIMARY KEY,
  memory_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  summary_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  conversation_id TEXT,
  summary TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_profile_id ON conversation_summaries(profile_id);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation_id ON conversation_summaries(conversation_id);

CREATE TABLE IF NOT EXISTS generated_images (
  image_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_data_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generated_images_profile_id ON generated_images(profile_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  entry_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  qa_transcript TEXT,
  mood TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_profile_date ON journal_entries(profile_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_profile_id ON journal_entries(profile_id);
`;

const ensure_profile_columns = (db) => {
  // SQLite doesn't auto-migrate when CREATE TABLE IF NOT EXISTS runs.
  // Add new columns for existing databases as needed.
  const cols = db.prepare("PRAGMA table_info(profiles)").all();
  const names = new Set(cols.map((c) => String(c.name || "").trim()).filter(Boolean));

  if (!names.has("phone_number")) {
    db.exec("ALTER TABLE profiles ADD COLUMN phone_number TEXT");
  }

  if (!names.has("sms_consent")) {
    db.exec("ALTER TABLE profiles ADD COLUMN sms_consent INTEGER NOT NULL DEFAULT 0");
  }

  if (!names.has("sms_consent_at")) {
    db.exec("ALTER TABLE profiles ADD COLUMN sms_consent_at TEXT");
  }
};

const ensure_schema = (db) => {
  db.exec(SCHEMA_SQL);
  ensure_profile_columns(db);
};

module.exports = { ensure_schema };

