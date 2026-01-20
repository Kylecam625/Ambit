export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const is_record = (value) => typeof value === "object" && value !== null;

export const to_string_or_empty = (value) => (typeof value === "string" ? value : "");

export const to_number_or_null = (value) => {
  const num = typeof value === "number" ? value : Number.parseFloat(String(value || ""));
  return Number.isFinite(num) ? num : null;
};

export const to_int_or_null = (value) => {
  const num = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isFinite(num) ? num : null;
};

export const now_iso = () => new Date().toISOString();

export const uuid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // fallback: not cryptographically strong
  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
};

export const uniq_strings = (items) => {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

