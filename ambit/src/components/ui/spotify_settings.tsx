"use client";

import { useState, useCallback } from "react";

type spotify_device_info = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
};

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

export const SpotifySettings = () => {
  const [is_loading, set_is_loading] = useState(false);
  const [is_configured, set_is_configured] = useState<boolean | null>(null);
  const [devices, set_devices] = useState<spotify_device_info[]>([]);
  const [error, set_error] = useState<string | null>(null);
  const [selecting_id, set_selecting_id] = useState<string | null>(null);
  const [preferred_id, set_preferred_id] = useState<string | null>(null);
  const [has_loaded, set_has_loaded] = useState(false);

  const load_devices = useCallback(async () => {
    set_is_loading(true);
    set_error(null);
    try {
      const res = await fetch("/api/spotify/devices");
      const data = (await res.json()) as {
        configured?: boolean;
        devices?: spotify_device_info[];
        preferred_device_id?: string | null;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        set_error(data.error ?? "Failed to load devices.");
        set_devices([]);
        return;
      }

      set_is_configured(data.configured ?? false);
      set_devices(data.devices ?? []);
      set_preferred_id(data.preferred_device_id ?? null);
      set_has_loaded(true);

      if (data.configured === false) {
        set_error(data.message ?? "Spotify not configured.");
      }
    } catch {
      set_error("Failed to connect to Spotify.");
    } finally {
      set_is_loading(false);
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
      // Refresh device list after selection
      await load_devices();
    } catch {
      set_error("Failed to select device.");
    } finally {
      set_selecting_id(null);
    }
  };

  const is_selected = (device_id: string) => device_id === preferred_id;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
        Spotify
      </label>

      {/* Status indicator */}
      {is_configured !== null && (
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              is_configured ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <span className="text-xs text-zinc-400">
            {is_configured
              ? preferred_id
                ? "Connected \u2022 Device selected"
                : "Connected \u2022 No device selected"
              : "Not configured"}
          </span>
        </div>
      )}

      {/* Load / Refresh button */}
      <button
        className="rounded-lg border-2 border-zinc-700 bg-zinc-950 px-4 py-2.5 text-left text-sm font-bold text-zinc-100 hover:border-zinc-500 disabled:opacity-50 transition-colors"
        onClick={() => void load_devices()}
        disabled={is_loading}
        type="button"
      >
        {is_loading
          ? "Loading..."
          : has_loaded
            ? "Refresh Devices"
            : "Load Devices"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Device list */}
      {has_loaded && is_configured && devices.length === 0 && !is_loading && (
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
              const selected = is_selected(device.id);
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
                      {device.volume_percent !== null && ` \u2022 ${device.volume_percent}%`}
                    </span>
                  </div>
                  {selecting_id === device.id && (
                    <span className="text-xs text-zinc-400 animate-pulse">
                      Selecting...
                    </span>
                  )}
                  {selected && (
                    <span className="text-xs text-emerald-400">\u2713</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Help text */}
      {has_loaded && is_configured && (
        <p className="text-[11px] text-zinc-600">
          {devices.length > 1 && !preferred_id
            ? "Pick a device above — music won\u2019t play until you select one."
            : "Spotify must be open on at least one device for music control to work."}
        </p>
      )}
    </div>
  );
};
