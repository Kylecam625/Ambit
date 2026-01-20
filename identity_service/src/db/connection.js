const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const ensure_parent_dir = (file_path) => {
  const dir = path.dirname(file_path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const open_db = ({ db_path }) => {
  ensure_parent_dir(db_path);
  const db = new Database(db_path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};

module.exports = { open_db };

