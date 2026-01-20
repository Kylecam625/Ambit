import { NextRequest } from "next/server";
import { has_google_calendar_refresh_token } from "@/lib/google_calendar/token_store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const profile_id_raw = to_string(url.searchParams.get("profile_id"));
  const profile_id = profile_id_raw && profile_id_raw !== "anonymous" ? profile_id_raw : null;

  try {
    const connected = await has_google_calendar_refresh_token({ profile_id });
    return Response.json({ connected });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read calendar status";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

