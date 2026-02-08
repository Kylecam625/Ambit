/**
 * Spotify Web API client for Ambit music control.
 *
 * Requires environment variables:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REFRESH_TOKEN  (obtained via OAuth flow)
 *
 * The refresh token is used to obtain short-lived access tokens automatically.
 */

export class NoActiveDeviceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoActiveDeviceError";
  }
}

const is_record = (value: unknown): value is Record<string, unknown> =>
 typeof value === "object" && value !== null;

let cached_access_token: string | null = null;
let token_expires_at = 0;

const get_spotify_env = () => {
  const client_id = process.env.SPOTIFY_CLIENT_ID?.trim() || "";
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET?.trim() || "";
  const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN?.trim() || "";
  return { client_id, client_secret, refresh_token };
};

export const is_spotify_configured = (): boolean => {
  const { client_id, client_secret, refresh_token } = get_spotify_env();
  return Boolean(client_id && client_secret && refresh_token);
};

const get_access_token = async (): Promise<string> => {
  if (cached_access_token && Date.now() < token_expires_at - 60_000) {
    return cached_access_token;
  }

  const { client_id, client_secret, refresh_token } = get_spotify_env();
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error("Spotify credentials not configured.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  if (!is_record(data)) throw new Error("Invalid Spotify token response.");

  const access_token = typeof data["access_token"] === "string" ? data["access_token"] : "";
  const expires_in = typeof data["expires_in"] === "number" ? data["expires_in"] : 3600;

  if (!access_token) throw new Error("Spotify returned empty access token.");

  cached_access_token = access_token;
  token_expires_at = Date.now() + expires_in * 1000;

  return access_token;
};

const spotify_api = async ({
  path,
  method = "GET",
  body = null,
}: {
  path: string;
  method?: string;
  body?: Record<string, unknown> | null;
}): Promise<Record<string, unknown> | null> => {
  const token = await get_access_token();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 No Content is a success for control endpoints
  if (response.status === 204) return null;

  if (!response.ok) {
    const error_text = await response.text().catch(() => "");

    // Detect "no active device" errors (Spotify returns 404 for player endpoints)
    if (response.status === 404 && path.startsWith("/me/player")) {
      throw new NoActiveDeviceError(
        "No active Spotify device found. Open Spotify on a device first, then select it in Settings."
      );
    }

    throw new Error(`Spotify API error ${response.status}: ${error_text.slice(0, 200)}`);
  }

  const data = await response.json().catch(() => null);
  return is_record(data) ? data : null;
};

export type spotify_action_result = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
};

export type spotify_device = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
};

/**
 * List available Spotify Connect devices.
 */
export const spotify_get_devices = async (): Promise<spotify_device[]> => {
  const data = await spotify_api({ path: "/me/player/devices" });
  if (!data) return [];

  const devices = Array.isArray(data["devices"]) ? data["devices"] : [];
  return (devices as Record<string, unknown>[]).map((d) => ({
    id: typeof d["id"] === "string" ? d["id"] : "",
    name: typeof d["name"] === "string" ? d["name"] : "Unknown",
    type: typeof d["type"] === "string" ? d["type"] : "Unknown",
    is_active: d["is_active"] === true,
    volume_percent: typeof d["volume_percent"] === "number" ? d["volume_percent"] : null,
  }));
};

/**
 * Transfer playback to a specific device.
 */
export const spotify_transfer_playback = async ({
  device_id,
  should_play = false,
}: {
  device_id: string;
  should_play?: boolean;
}): Promise<spotify_action_result> => {
  if (!device_id) return { ok: false, message: "No device ID provided." };

  await spotify_api({
    path: "/me/player",
    method: "PUT",
    body: { device_ids: [device_id], play: should_play },
  });

  return { ok: true, message: "Playback transferred." };
};

/* ------------------------------------------------------------------ */
/*  Preferred device — user selects their device in Settings           */
/*  Persisted to disk so the choice survives server restarts.          */
/* ------------------------------------------------------------------ */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const PREF_FILE = join(process.cwd(), ".spotify_preferred_device");

const load_preferred_device = (): string | null => {
  try {
    const raw = readFileSync(PREF_FILE, "utf-8").trim();
    return raw || null;
  } catch {
    return null;
  }
};

let preferred_device_id: string | null = load_preferred_device();

/** Get the user's preferred device ID (set via Settings). */
export const get_preferred_device = (): string | null => preferred_device_id;

/** Set the user's preferred device ID. Pass null to clear. Persists to disk. */
export const set_preferred_device = (device_id: string | null): void => {
  preferred_device_id = device_id;
  try {
    writeFileSync(PREF_FILE, device_id ?? "", "utf-8");
  } catch (err) {
    console.warn("[Spotify] Failed to persist preferred device:", err);
  }
  console.log(`[Spotify] Preferred device set to: ${device_id ?? "(none)"}`);
};

/**
 * Resolve which device to use for playback.
 *
 * Rules:
 *   1. If the user picked a device in Settings → use that one.
 *   2. If there is exactly 1 device available → use it automatically.
 *   3. Otherwise → return null (user must pick a device in Settings).
 */
const resolve_target_device = (devices: spotify_device[]): spotify_device | null => {
  if (devices.length === 0) return null;

  // 1. User's explicit choice
  if (preferred_device_id) {
    const preferred = devices.find((d) => d.id === preferred_device_id);
    if (preferred) return preferred;
    // Preferred device not in the list (turned off?) — fall through
    console.warn("[Spotify] Preferred device not found in available devices.");
  }

  // 2. Only one device — auto-select it
  if (devices.length === 1) return devices[0]!;

  // 3. Multiple devices, no preference — user must choose
  return null;
};

/**
 * Wait for a specific device to become active by polling the devices endpoint.
 * Spotify's Transfer Playback is async — the device isn't ready instantly.
 */
const wait_for_device_active = async (
  device_id: string,
  max_ms = 4000,
  poll_ms = 500
): Promise<boolean> => {
  const deadline = Date.now() + max_ms;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, poll_ms));
    const devices = await spotify_get_devices();
    const target = devices.find((d) => d.id === device_id);
    if (target?.is_active) return true;
  }
  return false;
};

/**
 * Ensure the target device is active and ready to accept commands.
 *
 * Per Spotify API docs:
 *   - PUT /me/player/play's `device_id` param does NOT activate inactive devices.
 *   - PUT /me/player (Transfer Playback) with `play: true` DOES activate a device.
 *   - "The order of execution is not guaranteed when you use this API with other
 *     Player API endpoints." — so we poll until the device is truly active.
 *
 * Device selection:
 *   - Uses the user's preferred device (from Settings), or auto-picks if only 1 available.
 *   - If multiple devices exist and no preference is set, returns null so the AI
 *     can tell the user to pick one in Settings.
 */
const ensure_device_active = async (): Promise<string | null> => {
  const devices = await spotify_get_devices();
  const target = resolve_target_device(devices);
  if (!target) {
    if (devices.length > 1) {
      throw new Error(
        `Multiple Spotify devices found but none selected. Go to Settings → Spotify and pick your playback device.`
      );
    }
    return null;
  }

  if (target.is_active) return target.id;

  // Device is inactive — use Transfer Playback to wake it up.
  console.log(`[Spotify] Activating device "${target.name}" (${target.type})...`);
  await spotify_transfer_playback({ device_id: target.id, should_play: true });

  // Poll until Spotify confirms the device is active
  const is_ready = await wait_for_device_active(target.id);
  if (!is_ready) {
    console.warn(`[Spotify] Device "${target.name}" did not become active in time.`);
  }

  return target.id;
};

export const spotify_now_playing = async (): Promise<spotify_action_result> => {
  const data = await spotify_api({ path: "/me/player/currently-playing" });
  if (!data) return { ok: true, message: "Nothing is currently playing." };

  const item = is_record(data["item"]) ? data["item"] : null;
  const name = typeof item?.["name"] === "string" ? item["name"] : "Unknown";
  const artists = Array.isArray(item?.["artists"])
    ? (item["artists"] as Record<string, unknown>[])
        .map((a) => (typeof a["name"] === "string" ? a["name"] : ""))
        .filter(Boolean)
        .join(", ")
    : "Unknown artist";
  const is_playing = data["is_playing"] === true;

  return {
    ok: true,
    message: is_playing
      ? `Now playing: "${name}" by ${artists}`
      : `Paused: "${name}" by ${artists}`,
    data: { name, artists, is_playing },
  };
};

export const spotify_play = async ({
  query,
}: {
  query?: string;
}): Promise<spotify_action_result> => {
  // Ensure the best device (prefer Computer) is active before playing.
  // Per Spotify docs, the play endpoint's device_id param does NOT activate
  // inactive devices — so we must ensure it's active first via Transfer Playback.
  const device_id = await ensure_device_active();
  if (!device_id) {
    return {
      ok: false,
      message:
        "No Spotify devices found. Open the Spotify desktop app on this computer, then try again.",
    };
  }

  if (query) {
    // Search for a track and play it
    const search_data = await spotify_api({
      path: `/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    });

    const tracks = is_record(search_data?.["tracks"]) ? search_data?.["tracks"] : null;
    const items = Array.isArray(tracks?.["items"]) ? tracks["items"] : [];
    const first_track = is_record(items[0]) ? items[0] : null;

    if (!first_track) {
      return { ok: false, message: `Couldn't find anything for "${query}".` };
    }

    const track_uri = typeof first_track["uri"] === "string" ? first_track["uri"] : "";
    const track_name = typeof first_track["name"] === "string" ? first_track["name"] : "Unknown";
    const artists = Array.isArray(first_track["artists"])
      ? (first_track["artists"] as Record<string, unknown>[])
          .map((a) => (typeof a["name"] === "string" ? a["name"] : ""))
          .filter(Boolean)
          .join(", ")
      : "";

    if (track_uri) {
      // Device is confirmed active — play the track.
      // No device_id param needed; Spotify targets the active device by default.
      await spotify_api({
        path: "/me/player/play",
        method: "PUT",
        body: { uris: [track_uri] },
      });
      // Duck volume immediately — TTS will speak the confirmation next
      await spotify_duck();
      return {
        ok: true,
        message: `Playing "${track_name}" by ${artists || "unknown artist"}.`,
        data: { track_name, artists, uri: track_uri },
      };
    }
  }

  // Resume playback — device is already active
  await spotify_api({ path: "/me/player/play", method: "PUT" });
  // Duck volume immediately — TTS will speak the confirmation next
  await spotify_duck();
  return { ok: true, message: "Resumed playback." };
};

export const spotify_pause = async (): Promise<spotify_action_result> => {
  // Pause targets the active device automatically
  await spotify_api({ path: "/me/player/pause", method: "PUT" });
  return { ok: true, message: "Paused." };
};

export const spotify_skip = async (): Promise<spotify_action_result> => {
  await spotify_api({ path: "/me/player/next", method: "POST" });
  return { ok: true, message: "Skipped to next track." };
};

export const spotify_previous = async (): Promise<spotify_action_result> => {
  await spotify_api({ path: "/me/player/previous", method: "POST" });
  return { ok: true, message: "Went back to previous track." };
};

export const spotify_volume = async ({
  volume_percent,
}: {
  volume_percent: number;
}): Promise<spotify_action_result> => {
  const safe_vol = Math.max(0, Math.min(100, Math.round(volume_percent)));
  await spotify_api({
    path: `/me/player/volume?volume_percent=${safe_vol}`,
    method: "PUT",
  });
  return { ok: true, message: `Volume set to ${safe_vol}%.` };
};

/* ------------------------------------------------------------------ */
/*  Volume ducking — lowers volume while Ambit is speaking via TTS     */
/* ------------------------------------------------------------------ */

const DUCK_VOLUME = 30;
const FULL_VOLUME = 100;

/**
 * Quick, fire-and-forget volume set. Skips device lookup to be fast.
 * Used by the client-side TTS hooks via /api/spotify/volume.
 */
export const spotify_set_volume_quick = async (
  volume_percent: number
): Promise<void> => {
  const safe_vol = Math.max(0, Math.min(100, Math.round(volume_percent)));
  try {
    await spotify_api({
      path: `/me/player/volume?volume_percent=${safe_vol}`,
      method: "PUT",
    });
  } catch {
    // Best-effort — don't break TTS flow if volume set fails
  }
};

/** Duck music volume to 30% (called when TTS starts speaking). */
export const spotify_duck = async (): Promise<void> =>
  spotify_set_volume_quick(DUCK_VOLUME);

/** Restore music volume to 100% (called when TTS finishes speaking). */
export const spotify_restore = async (): Promise<void> =>
  spotify_set_volume_quick(FULL_VOLUME);

export const spotify_search = async ({
  query,
}: {
  query: string;
}): Promise<spotify_action_result> => {
  if (!query.trim()) return { ok: false, message: "No search query provided." };

  const data = await spotify_api({
    path: `/search?q=${encodeURIComponent(query)}&type=track&limit=3`,
  });

  const tracks = is_record(data?.["tracks"]) ? data?.["tracks"] : null;
  const items = Array.isArray(tracks?.["items"]) ? tracks["items"] : [];

  if (items.length === 0) {
    return { ok: true, message: `No results for "${query}".` };
  }

  const results = (items as Record<string, unknown>[]).map((t) => {
    const name = typeof t["name"] === "string" ? t["name"] : "Unknown";
    const artists = Array.isArray(t["artists"])
      ? (t["artists"] as Record<string, unknown>[])
          .map((a) => (typeof a["name"] === "string" ? a["name"] : ""))
          .filter(Boolean)
          .join(", ")
      : "";
    return `"${name}" by ${artists || "unknown"}`;
  });

  return {
    ok: true,
    message: `Found: ${results.join("; ")}`,
    data: { results },
  };
};

/**
 * Execute a Spotify control action.
 */
export const execute_spotify_action = async ({
  action,
  query,
  volume_percent,
}: {
  action: string;
  query?: string;
  volume_percent?: number;
}): Promise<spotify_action_result> => {
  try {
    switch (action) {
      case "now_playing":
        return await spotify_now_playing();
      case "play":
        return await spotify_play({ query });
      case "pause":
        return await spotify_pause();
      case "skip":
        return await spotify_skip();
      case "previous":
        return await spotify_previous();
      case "volume":
        return await spotify_volume({ volume_percent: volume_percent ?? 50 });
      case "search":
        return await spotify_search({ query: query ?? "" });
      default:
        return { ok: false, message: `Unknown action: ${action}` };
    }
  } catch (error) {
    if (error instanceof NoActiveDeviceError) {
      console.warn(`[Spotify] ${action}: no active device`);
      return {
        ok: false,
        message:
          "No active Spotify device found. Open Spotify on your phone, computer, or web browser, then try again. You can also pick a device in Settings.",
      };
    }
    const msg = error instanceof Error ? error.message : "Spotify action failed.";
    console.error(`[Spotify] ${action} failed:`, error);
    return { ok: false, message: msg };
  }
};
