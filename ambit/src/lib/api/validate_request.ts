/** Shared request body validation helpers for API routes. */

export const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const to_string = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const to_int = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.floor(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const to_array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const to_boolean = (value: unknown): boolean =>
  value === true || value === "true" || value === 1;

/**
 * Safely parse a JSON request body. Returns null if parsing fails.
 */
export const safe_json = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return is_record(body) ? body : null;
  } catch {
    // Request body is not valid JSON; return null so the caller can handle it
    return null;
  }
};
