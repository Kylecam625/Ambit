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
      await spotify_api({
        path: "/me/player/play",
        method: "PUT",
        body: { uris: [track_uri] },
      });
      return {
        ok: true,
        message: `Playing "${track_name}" by ${artists || "unknown artist"}.`,
        data: { track_name, artists, uri: track_uri },
      };
    }
  }

  // Resume playback
  await spotify_api({ path: "/me/player/play", method: "PUT" });
  return { ok: true, message: "Resumed playback." };
};

export const spotify_pause = async (): Promise<spotify_action_result> => {
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
    const msg = error instanceof Error ? error.message : "Spotify action failed.";
    console.error(`[Spotify] ${action} failed:`, error);
    return { ok: false, message: msg };
  }
};
