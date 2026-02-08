import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import {
  is_spotify_configured,
  spotify_duck,
  spotify_restore,
  spotify_set_volume_quick,
} from "@/lib/spotify/spotify_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/spotify/volume — Quick volume control for TTS ducking.
 * Body: { action: "duck" | "restore" } or { volume: number }
 *
 * "duck"    → 30%  (call when TTS starts speaking)
 * "restore" → 100% (call when TTS finishes speaking)
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!is_spotify_configured()) {
    // Silently succeed — don't break TTS flow when Spotify isn't set up
    return Response.json({ ok: true, skipped: true });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body["action"] === "string" ? body["action"] : "";
    const volume = typeof body["volume"] === "number" ? body["volume"] : null;

    if (action === "duck") {
      await spotify_duck();
      return Response.json({ ok: true, volume: 30 });
    }

    if (action === "restore") {
      await spotify_restore();
      return Response.json({ ok: true, volume: 100 });
    }

    if (volume !== null) {
      await spotify_set_volume_quick(volume);
      return Response.json({ ok: true, volume });
    }

    return bad_request('Provide { action: "duck" | "restore" } or { volume: number }.');
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Volume control failed.";
    console.error("[Spotify volume] POST failed:", error);
    return internal_error(msg);
  }
}
