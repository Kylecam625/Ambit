const now_iso = () => new Date().toISOString();

const is_record = (value) => typeof value === "object" && value !== null;

const to_string = (value) => (typeof value === "string" ? value : "");

const to_int_or_null = (value) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const uniq_strings = (items) => {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

const uuid = () => {
  // Node 18+ supports crypto.randomUUID
  const crypto = require("node:crypto");
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
};

module.exports = {
  is_record,
  now_iso,
  to_int_or_null,
  to_string,
  uniq_strings,
  uuid,
};

