/** Standardized error response builder for API routes. */

export const error_response = (
  message: string,
  status: number = 500
): Response =>
  Response.json({ error: message }, { status });

/** Standardized 400 Bad Request. */
export const bad_request = (message: string): Response =>
  error_response(message, 400);

/** Standardized 404 Not Found. */
export const not_found = (message: string = "Not found"): Response =>
  error_response(message, 404);

/** Standardized 500 Internal Server Error. */
export const internal_error = (
  message: string = "Internal server error"
): Response => error_response(message, 500);
