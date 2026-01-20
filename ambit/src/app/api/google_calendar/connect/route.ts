import { NextRequest, NextResponse } from "next/server";
import {
  build_google_calendar_authorization_url,
  create_google_oauth_state,
  get_google_oauth_redirect_url,
} from "@/lib/google_calendar/google_oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_STATE = "ambit.gcal_oauth_state.v1";
const COOKIE_PROFILE_ID = "ambit.gcal_oauth_profile_id.v1";
const COOKIE_RETURN_TO = "ambit.gcal_oauth_return_to.v1";

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const cookie_options = ({ request }: { request: NextRequest }) => {
  const url = new URL(request.url);
  const is_secure = url.protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: is_secure,
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };
};

const normalize_return_to = ({
  origin,
  return_to,
}: {
  origin: string;
  return_to: string;
}): string => {
  const trimmed = to_string(return_to);
  if (!trimmed) return "/";

  // Allow relative paths like "/mouth"
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  // Allow same-origin absolute URLs
  try {
    const parsed = new URL(trimmed);
    if (parsed.origin !== origin) return "/";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
};

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;

  const profile_id = to_string(url.searchParams.get("profile_id")) || "anonymous";
  const redirect_url = get_google_oauth_redirect_url({ request_origin: origin });
  const state = create_google_oauth_state();

  const auth_url = build_google_calendar_authorization_url({ redirect_url, state });

  const return_to = normalize_return_to({
    origin,
    return_to: to_string(url.searchParams.get("return_to")) || to_string(request.headers.get("referer")),
  });

  const response = NextResponse.redirect(auth_url);
  response.cookies.set(COOKIE_STATE, state, cookie_options({ request }));
  response.cookies.set(COOKIE_PROFILE_ID, profile_id, cookie_options({ request }));
  response.cookies.set(COOKIE_RETURN_TO, return_to, cookie_options({ request }));
  return response;
}

