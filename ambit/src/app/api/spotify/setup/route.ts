import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import {
  load_spotify_config,
  save_spotify_config,
  delete_spotify_config,
  has_client_credentials,
  has_refresh_token,
} from "@/lib/spotify/spotify_config";
import { is_spotify_configured, invalidate_spotify_token_cache } from "@/lib/spotify/spotify_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIRECT_URI = "http://127.0.0.1:3000/callback";
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing";

/**
 * Build the Spotify authorization URL for the OAuth flow.
 */
const build_auth_url = (client_id: string): string => {
  const params = new URLSearchParams({
    client_id,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
};

/**
 * Resolve the best client_id available (config file first, then env).
 */
const resolve_client_id = (): string => {
  const config = load_spotify_config();
  return config.client_id || process.env.SPOTIFY_CLIENT_ID?.trim() || "";
};

/**
 * GET /api/spotify/setup — Return current setup status.
 */
export async function GET(): Promise<Response> {
  const env_configured = Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
    process.env.SPOTIFY_CLIENT_SECRET?.trim() &&
    process.env.SPOTIFY_REFRESH_TOKEN?.trim()
  );

  const client_id = resolve_client_id();

  return Response.json({
    configured: is_spotify_configured(),
    has_client_creds: has_client_credentials() || env_configured,
    has_refresh_token: has_refresh_token() || env_configured,
    env_configured,
    // Always provide auth_url when we have a client_id (needed for reconnect)
    auth_url: client_id ? build_auth_url(client_id) : null,
  });
}

/**
 * POST /api/spotify/setup — Save client credentials and return the auth URL.
 * Body: { client_id: string, client_secret: string }
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const client_id = typeof body["client_id"] === "string" ? body["client_id"].trim() : "";
    const client_secret = typeof body["client_secret"] === "string" ? body["client_secret"].trim() : "";

    if (!client_id || !client_secret) {
      return bad_request("Both client_id and client_secret are required.");
    }

    // Save credentials and clear any stale refresh_token so the new
    // OAuth flow produces a fresh one that actually gets used.
    save_spotify_config({ client_id, client_secret, refresh_token: "" });

    // Invalidate any cached access token since credentials may have changed
    invalidate_spotify_token_cache();

    const auth_url = build_auth_url(client_id);

    return Response.json({
      ok: true,
      auth_url,
      message: "Credentials saved. Open the auth URL to authorize Spotify.",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save credentials.";
    console.error("[Spotify setup] POST failed:", error);
    return internal_error(msg);
  }
}

/**
 * DELETE /api/spotify/setup — Disconnect Spotify (delete config file).
 */
export async function DELETE(): Promise<Response> {
  try {
    delete_spotify_config();
    invalidate_spotify_token_cache();
    return Response.json({ ok: true, message: "Spotify disconnected." });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to disconnect.";
    console.error("[Spotify setup] DELETE failed:", error);
    return internal_error(msg);
  }
}
