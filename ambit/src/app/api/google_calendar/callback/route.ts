import { NextRequest, NextResponse } from "next/server";
import {
  exchange_google_oauth_code_for_tokens,
  get_google_oauth_redirect_url,
} from "@/lib/google_calendar/google_oauth";
import { set_google_calendar_refresh_token } from "@/lib/google_calendar/token_store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_STATE = "ambit.gcal_oauth_state.v1";
const COOKIE_PROFILE_ID = "ambit.gcal_oauth_profile_id.v1";
const COOKIE_RETURN_TO = "ambit.gcal_oauth_return_to.v1";

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalize_return_to = (value: string): string => {
  const trimmed = to_string(value);
  if (!trimmed) return "/";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return "/";
};

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;

  const code = to_string(url.searchParams.get("code"));
  const state = to_string(url.searchParams.get("state"));
  const error = to_string(url.searchParams.get("error"));

  const expected_state = to_string(request.cookies.get(COOKIE_STATE)?.value);
  const profile_id_cookie = to_string(request.cookies.get(COOKIE_PROFILE_ID)?.value);
  const return_to_cookie = normalize_return_to(to_string(request.cookies.get(COOKIE_RETURN_TO)?.value));

  const redirect_back = (params: Record<string, string>): NextResponse => {
    const target = new URL(return_to_cookie, origin);
    for (const [k, v] of Object.entries(params)) {
      if (k && v) target.searchParams.set(k, v);
    }
    return NextResponse.redirect(target.toString());
  };

  if (error) {
    const response = redirect_back({ gcal: "error", gcal_error: error });
    response.cookies.delete(COOKIE_STATE);
    response.cookies.delete(COOKIE_PROFILE_ID);
    response.cookies.delete(COOKIE_RETURN_TO);
    return response;
  }

  if (!state || !expected_state || state !== expected_state) {
    return new Response("State mismatch. Please try connecting again.", { status: 400 });
  }

  if (!code) {
    return new Response("Missing OAuth code.", { status: 400 });
  }

  try {
    const redirect_url = get_google_oauth_redirect_url({ request_origin: origin });
    const tokens = await exchange_google_oauth_code_for_tokens({ redirect_url, code });

    if (!tokens.refresh_token) {
      const response = redirect_back({ gcal: "missing_refresh_token" });
      response.cookies.delete(COOKIE_STATE);
      response.cookies.delete(COOKIE_PROFILE_ID);
      response.cookies.delete(COOKIE_RETURN_TO);
      return response;
    }

    const profile_id = profile_id_cookie && profile_id_cookie !== "anonymous" ? profile_id_cookie : null;
    await set_google_calendar_refresh_token({ profile_id, refresh_token: tokens.refresh_token });

    const response = redirect_back({ gcal: "connected" });
    response.cookies.delete(COOKIE_STATE);
    response.cookies.delete(COOKIE_PROFILE_ID);
    response.cookies.delete(COOKIE_RETURN_TO);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed";
    const response = redirect_back({ gcal: "error", gcal_error: message });
    response.cookies.delete(COOKIE_STATE);
    response.cookies.delete(COOKIE_PROFILE_ID);
    response.cookies.delete(COOKIE_RETURN_TO);
    return response;
  }
}

