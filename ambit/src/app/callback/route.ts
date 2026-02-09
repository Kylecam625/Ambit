import { NextRequest, NextResponse } from "next/server";
import { load_spotify_config, save_spotify_config } from "@/lib/spotify/spotify_config";
import { invalidate_spotify_token_cache } from "@/lib/spotify/spotify_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIRECT_URI = "http://127.0.0.1:3000/callback";

/**
 * GET /callback — Handle the OAuth redirect from Spotify.
 *
 * Spotify redirects here with ?code=... after the user authorizes.
 * We exchange the code for a refresh token, save it, and redirect
 * back to the main page with a success indicator.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // User denied access
  if (error) {
    console.warn("[Spotify callback] Authorization denied:", error);
    return NextResponse.redirect(
      new URL("/?spotify_setup=denied", request.url)
    );
  }

  if (!code) {
    console.warn("[Spotify callback] No code in callback URL.");
    return NextResponse.redirect(
      new URL("/?spotify_setup=error&reason=no_code", request.url)
    );
  }

  // Read client credentials from config file
  const config = load_spotify_config();
  if (!config.client_id || !config.client_secret) {
    console.error("[Spotify callback] No client credentials in config file.");
    return NextResponse.redirect(
      new URL("/?spotify_setup=error&reason=no_credentials", request.url)
    );
  }

  // Exchange the authorization code for tokens
  try {
    const token_response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!token_response.ok) {
      const error_body = await token_response.text().catch(() => "");
      console.error("[Spotify callback] Token exchange failed:", token_response.status, error_body);
      return NextResponse.redirect(
        new URL(`/?spotify_setup=error&reason=token_exchange_failed`, request.url)
      );
    }

    const data = (await token_response.json()) as Record<string, unknown>;
    const refresh_token = typeof data["refresh_token"] === "string" ? data["refresh_token"] : "";

    if (!refresh_token) {
      console.error("[Spotify callback] No refresh_token in response.");
      return NextResponse.redirect(
        new URL("/?spotify_setup=error&reason=no_refresh_token", request.url)
      );
    }

    // Save the refresh token to the config file
    save_spotify_config({ refresh_token });

    // Invalidate any stale cached access token
    invalidate_spotify_token_cache();

    console.log("[Spotify callback] Setup complete! Refresh token saved.");

    return NextResponse.redirect(
      new URL("/?spotify_setup=success", request.url)
    );
  } catch (err) {
    console.error("[Spotify callback] Token exchange error:", err);
    return NextResponse.redirect(
      new URL("/?spotify_setup=error&reason=exception", request.url)
    );
  }
}
