import { NextRequest } from "next/server";
import { delete_google_calendar_refresh_token } from "@/lib/google_calendar/token_store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const parse_profile_id = async (request: NextRequest): Promise<string | null> => {
  const url = new URL(request.url);
  const from_query = to_string(url.searchParams.get("profile_id"));
  if (from_query) return from_query === "anonymous" ? null : from_query;

  try {
    const body = (await request.json()) as { profile_id?: unknown } | null;
    const from_body = to_string(body?.profile_id);
    if (!from_body) return null;
    return from_body === "anonymous" ? null : from_body;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const profile_id = await parse_profile_id(request);
    await delete_google_calendar_refresh_token({ profile_id });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disconnect";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

