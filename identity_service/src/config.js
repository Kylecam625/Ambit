const path = require("node:path");

const get_env = (key, fallback = "") => {
  const value = process.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const to_int = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Workspace root (Chadbit)
const root_dir = path.resolve(__dirname, "..", "..");
const data_dir = path.resolve(root_dir, "data");
const db_path = path.resolve(data_dir, get_env("IDENTITY_DB_FILE", "identity.db"));

const static_root = path.resolve(root_dir, "identity_prototype");

module.exports = {
  port: to_int(get_env("PORT", "5176"), 5176),
  db_path,
  static_root,
};

