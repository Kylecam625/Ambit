import { NextRequest } from "next/server";
import { bad_request, internal_error } from "@/lib/api/error_response";
import {
  is_spotify_configured,
  spotify_get_devices,
  spotify_transfer_playback,
  get_preferred_device,
  set_preferred_device,
} from "@/lib/spotify/spotify_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/spotify/devices — List available devices + the preferred device ID.
 */
export async function GET(): Promise<Response> {
  if (!is_spotify_configured()) {
    return Response.json({
      configured: false,
      devices: [],
      preferred_device_id: null,
      message: "Spotify is not configured. Add your credentials to .env.local.",
    });
  }

  try {
    const devices = await spotify_get_devices();
    return Response.json({
      configured: true,
      devices,
      preferred_device_id: get_preferred_device(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch devices.";
    console.error("[Spotify devices] GET failed:", error);
    return internal_error(msg);
  }
}

/**
 * PUT /api/spotify/devices — Select a preferred device and optionally transfer playback.
 * Body: { device_id: string, play?: boolean }
 *
 * This sets the device as the user's preferred playback device AND transfers
 * playback to it. All future music commands will target this device.
 */
export async function PUT(request: NextRequest): Promise<Response> {
  if (!is_spotify_configured()) {
    return bad_request("Spotify is not configured.");
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const device_id = typeof body["device_id"] === "string" ? body["device_id"].trim() : "";

    if (!device_id) {
      return bad_request("device_id is required.");
    }

    // Save as the preferred device
    set_preferred_device(device_id);

    // Transfer playback to the selected device
    const should_play = body["play"] === true;
    const result = await spotify_transfer_playback({ device_id, should_play });

    return Response.json({ ...result, preferred_device_id: device_id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to transfer playback.";
    console.error("[Spotify devices] PUT failed:", error);
    return internal_error(msg);
  }
}
