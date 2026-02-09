"use client";

import { useState, useCallback, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type spotify_device_info = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
};

type setup_status = {
  configured: boolean;
  has_client_creds: boolean;
  has_refresh_token: boolean;
  env_configured: boolean;
  auth_url: string | null;
};

type ui_phase =
  | "loading"       // initial check
  | "setup"         // show setup wizard (no creds yet)
  | "authorizing"   // creds saved, waiting for OAuth callback
  | "connected"     // fully configured — show device picker
  | "success";      // just completed setup — flash success then go to connected

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEVICE_ICONS: Record<string, string> = {
  Computer: "\u{1F4BB}",
  Smartphone: "\u{1F4F1}",
  Speaker: "\u{1F50A}",
  TV: "\u{1F4FA}",
  CastVideo: "\u{1F4FA}",
  CastAudio: "\u{1F50A}",
  Automobile: "\u{1F697}",
  Tablet: "\u{1F4F1}",
};

const REDIRECT_URI = "http://127.0.0.1:3000/callback";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SpotifySettings = () => {
  const [phase, set_phase] = useState<ui_phase>("loading");
  const [error, set_error] = useState<string | null>(null);

  // Setup form
  const [client_id, set_client_id] = useState("");
  const [client_secret, set_client_secret] = useState("");
  const [is_saving, set_is_saving] = useState(false);
  const [auth_url, set_auth_url] = useState<string | null>(null);

  // Device picker (connected state)
  const [devices, set_devices] = useState<spotify_device_info[]>([]);
  const [preferred_id, set_preferred_id] = useState<string | null>(null);
  const [is_loading_devices, set_is_loading_devices] = useState(false);
  const [selecting_id, set_selecting_id] = useState<string | null>(null);
  const [has_loaded_devices, set_has_loaded_devices] = useState(false);

  // Disconnect
  const [is_disconnecting, set_is_disconnecting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Check setup status                                               */
  /* ---------------------------------------------------------------- */

  const check_status = useCallback(async (): Promise<setup_status | null> => {
    try {
      const res = await fetch("/api/spotify/setup");
      if (!res.ok) return null;
      return (await res.json()) as setup_status;
    } catch {
      return null;
    }
  }, []);

  const refresh_phase = useCallback(async () => {
    const status = await check_status();
    if (!status) {
      set_phase("setup");
      return;
    }

    // Always store the auth_url so "Reconnect" can use it
    if (status.auth_url) set_auth_url(status.auth_url);

    if (status.configured) {
      set_phase("connected");
    } else if (status.has_client_creds && !status.has_refresh_token) {
      set_phase("authorizing");
    } else {
      set_phase("setup");
    }
  }, [check_status]);

  // Initial status check on mount
  useEffect(() => {
    void refresh_phase();
  }, [refresh_phase]);

  // Detect ?spotify_setup= query param (set by OAuth callback redirect)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const setup_result = params.get("spotify_setup");
    if (!setup_result) return;

    // Clean the URL
    const url = new URL(window.location.href);
    url.searchParams.delete("spotify_setup");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());

    if (setup_result === "success") {
      set_phase("success");
      // After a brief flash, transition to connected
      setTimeout(() => {
        set_phase("connected");
      }, 2000);
    } else if (setup_result === "denied") {
      set_error("Spotify authorization was denied.");
      set_phase("setup");
    } else if (setup_result === "error") {
      const reason = params.get("reason") || "unknown";
      set_error(`Spotify setup failed: ${reason.replace(/_/g, " ")}`);
      set_phase("setup");
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Setup actions                                                    */
  /* ---------------------------------------------------------------- */

  const handle_save_and_authorize = async () => {
    if (!client_id.trim() || !client_secret.trim()) {
      set_error("Both Client ID and Client Secret are required.");
      return;
    }
    set_is_saving(true);
    set_error(null);
    try {
      const res = await fetch("/api/spotify/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client_id.trim(),
          client_secret: client_secret.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        auth_url?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        set_error(data.error ?? "Failed to save credentials.");
        return;
      }

      if (data.auth_url) {
        set_auth_url(data.auth_url);
        // Navigate in the same tab — window.open("_blank") gets blocked
        // by popup blockers when called after an async fetch.
        // The OAuth callback redirects back to / so the user returns here.
        window.location.href = data.auth_url;
      }
    } catch {
      set_error("Failed to save credentials.");
    } finally {
      set_is_saving(false);
    }
  };

  /** Re-authorize: navigates to Spotify auth to get a fresh refresh token. */
  const handle_reconnect = async () => {
    set_error(null);
    // Fetch the latest auth_url from the server
    const status = await check_status();
    if (status?.auth_url) {
      window.location.href = status.auth_url;
    } else {
      // No client creds at all — go to full setup
      set_phase("setup");
    }
  };

  const handle_disconnect = async () => {
    set_is_disconnecting(true);
    set_error(null);
    try {
      await fetch("/api/spotify/setup", { method: "DELETE" });
      set_phase("setup");
      set_client_id("");
      set_client_secret("");
      set_auth_url(null);
      set_devices([]);
      set_preferred_id(null);
      set_has_loaded_devices(false);
    } catch {
      set_error("Failed to disconnect.");
    } finally {
      set_is_disconnecting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Device picker actions                                            */
  /* ---------------------------------------------------------------- */

  const load_devices = useCallback(async () => {
    set_is_loading_devices(true);
    set_error(null);
    try {
      const res = await fetch("/api/spotify/devices");
      const data = (await res.json()) as {
        configured?: boolean;
        devices?: spotify_device_info[];
        preferred_device_id?: string | null;
        error?: string;
      };

      if (!res.ok) {
        const err_msg = data.error ?? "Failed to load devices.";
        // Detect token refresh failures — user needs to re-authorize
        if (err_msg.includes("token refresh failed") || err_msg.includes("400")) {
          set_error("Spotify token expired. Click Reconnect to re-authorize.");
        } else {
          set_error(err_msg);
        }
        return;
      }

      if (data.configured === false) {
        set_phase("setup");
        set_error("Spotify credentials are invalid. Please reconnect.");
        return;
      }

      set_devices(data.devices ?? []);
      set_preferred_id(data.preferred_device_id ?? null);
      set_has_loaded_devices(true);
    } catch {
      set_error("Failed to connect to Spotify.");
    } finally {
      set_is_loading_devices(false);
    }
  }, []);

  const select_device = async (device_id: string) => {
    set_selecting_id(device_id);
    set_error(null);
    try {
      const res = await fetch("/api/spotify/devices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id, play: false }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        set_error(data.error ?? "Failed to select device.");
        return;
      }
      set_preferred_id(device_id);
      await load_devices();
    } catch {
      set_error("Failed to select device.");
    } finally {
      set_selecting_id(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
        Spotify
      </label>

      {/* ---- Loading ---- */}
      {phase === "loading" && (
        <p className="text-xs text-zinc-500 animate-pulse">Checking Spotify status...</p>
      )}

      {/* ---- Success flash ---- */}
      {phase === "success" && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-600/50 bg-emerald-950/30 px-3 py-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium text-emerald-200">
            Spotify connected successfully!
          </span>
        </div>
      )}

      {/* ---- Setup wizard ---- */}
      {phase === "setup" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-400">
            Connect your Spotify account to control music with Ambit.
          </p>

          {/* Step 1 */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-zinc-300">
              1. Create a Spotify app
            </p>
            <p className="text-[11px] text-zinc-500">
              Go to{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 underline hover:text-zinc-200 transition-colors"
              >
                developer.spotify.com/dashboard
              </a>
              {" "}and click &quot;Create App&quot;.
            </p>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-zinc-300">
              2. Add the redirect URI
            </p>
            <p className="text-[11px] text-zinc-500">
              In your app&apos;s settings, add this Redirect URI:
            </p>
            <div
              className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 cursor-pointer hover:border-zinc-500 transition-colors"
              onClick={() => void navigator.clipboard.writeText(REDIRECT_URI)}
              title="Click to copy"
            >
              <code className="flex-1 text-[11px] text-zinc-300 font-mono truncate">
                {REDIRECT_URI}
              </code>
              <span className="text-[10px] text-zinc-500 shrink-0">click to copy</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-zinc-300">
              3. Enter your credentials
            </p>
            <input
              type="text"
              placeholder="Client ID"
              value={client_id}
              onChange={(e) => set_client_id(e.target.value)}
              className="rounded-lg border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
              autoComplete="off"
              spellCheck={false}
            />
            <input
              type="password"
              placeholder="Client Secret"
              value={client_secret}
              onChange={(e) => set_client_secret(e.target.value)}
              className="rounded-lg border-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Connect button */}
          <button
            className="rounded-lg border-2 border-emerald-700/50 bg-emerald-950/40 px-4 py-2.5 text-sm font-bold text-emerald-200 hover:border-emerald-600 disabled:opacity-50 transition-colors"
            onClick={() => void handle_save_and_authorize()}
            disabled={is_saving || !client_id.trim() || !client_secret.trim()}
            type="button"
          >
            {is_saving ? "Saving..." : "Connect Spotify"}
          </button>
        </div>
      )}

      {/* ---- Authorizing (waiting for OAuth callback) ---- */}
      {phase === "authorizing" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-zinc-400">
              Waiting for Spotify authorization...
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            A browser tab should have opened. Log in to Spotify and click &quot;Agree&quot;.
            You&apos;ll be redirected back here automatically.
          </p>
          {auth_url && (
            <button
              className="rounded-lg border-2 border-zinc-700 bg-zinc-950 px-4 py-2.5 text-left text-sm font-bold text-zinc-100 hover:border-zinc-500 transition-colors"
              onClick={() => { window.location.href = auth_url; }}
              type="button"
            >
              Open Spotify Auth Again
            </button>
          )}
          <button
            className="text-[11px] text-zinc-600 hover:text-zinc-400 text-left transition-colors"
            onClick={() => void refresh_phase()}
            type="button"
          >
            I&apos;ve authorized &mdash; check again
          </button>
          <button
            className="text-[11px] text-zinc-600 hover:text-zinc-400 text-left transition-colors"
            onClick={() => {
              set_phase("setup");
              set_auth_url(null);
            }}
            type="button"
          >
            Start over
          </button>
        </div>
      )}

      {/* ---- Connected — device picker ---- */}
      {phase === "connected" && (
        <div className="flex flex-col gap-2">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            <span className="text-xs text-zinc-400">
              {preferred_id
                ? "Connected \u2022 Device selected"
                : "Connected \u2022 No device selected"}
            </span>
          </div>

          {/* Load / Refresh button */}
          <button
            className="rounded-lg border-2 border-zinc-700 bg-zinc-950 px-4 py-2.5 text-left text-sm font-bold text-zinc-100 hover:border-zinc-500 disabled:opacity-50 transition-colors"
            onClick={() => void load_devices()}
            disabled={is_loading_devices}
            type="button"
          >
            {is_loading_devices
              ? "Loading..."
              : has_loaded_devices
                ? "Refresh Devices"
                : "Load Devices"}
          </button>

          {/* Device list */}
          {has_loaded_devices && devices.length === 0 && !is_loading_devices && (
            <p className="text-xs text-zinc-500">
              No devices found. Open Spotify on your phone, computer, or web browser and try again.
            </p>
          )}

          {devices.length > 0 && (
            <>
              <p className="text-[11px] text-zinc-500">
                Select your playback device:
              </p>
              <div className="flex flex-col gap-1.5">
                {devices.map((device) => {
                  const selected = device.id === preferred_id;
                  return (
                    <button
                      key={device.id}
                      className={`flex items-center gap-2.5 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "border-emerald-600/50 bg-emerald-950/30 text-emerald-200"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
                      } disabled:opacity-50`}
                      onClick={() => void select_device(device.id)}
                      disabled={selected || selecting_id === device.id}
                      type="button"
                      title={
                        selected
                          ? "Selected playback device"
                          : "Click to select this device"
                      }
                    >
                      <span className="text-base leading-none">
                        {DEVICE_ICONS[device.type] ?? "\u{1F3B5}"}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {device.name}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {device.type}
                          {device.is_active && " \u2022 Active"}
                          {selected && " \u2022 Selected"}
                          {device.volume_percent !== null &&
                            ` \u2022 ${device.volume_percent}%`}
                        </span>
                      </div>
                      {selecting_id === device.id && (
                        <span className="text-xs text-zinc-400 animate-pulse">
                          Selecting...
                        </span>
                      )}
                      {selected && (
                        <span className="text-xs text-emerald-400">
                          {"\u2713"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Help text */}
          {has_loaded_devices && (
            <p className="text-[11px] text-zinc-600">
              {devices.length > 1 && !preferred_id
                ? "Pick a device above \u2014 music won\u2019t play until you select one."
                : "Spotify must be open on at least one device for music control to work."}
            </p>
          )}

          {/* Reconnect + Disconnect */}
          <div className="mt-1 flex items-center gap-3">
            <button
              className="text-[11px] text-zinc-400 hover:text-zinc-200 text-left transition-colors"
              onClick={() => void handle_reconnect()}
              type="button"
            >
              Reconnect
            </button>
            <span className="text-[11px] text-zinc-700">|</span>
            <button
              className="text-[11px] text-zinc-600 hover:text-red-400 text-left transition-colors"
              onClick={() => void handle_disconnect()}
              disabled={is_disconnecting}
              type="button"
            >
              {is_disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      )}

      {/* ---- Shared error display ---- */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};
