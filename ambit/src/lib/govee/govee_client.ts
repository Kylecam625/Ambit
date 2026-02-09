/**
 * Govee Developer API v2 client for Ambit smart light control.
 *
 * Requires environment variable:
 *   GOVEE_API_KEY  (obtained from the Govee Home app → Settings → About Us → Apply for API Key)
 *
 * Uses the Govee OpenAPI v2 capability-based system to list devices, get state,
 * and control lights (on/off, brightness, color, color temperature).
 *
 * API base: https://openapi.api.govee.com
 */

import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const GOVEE_BASE_URL = "https://openapi.api.govee.com";

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/* ------------------------------------------------------------------ */
/*  Environment & configuration                                        */
/* ------------------------------------------------------------------ */

const get_govee_api_key = (): string =>
  (process.env.GOVEE_API_KEY ?? "").trim();

/** Whether the Govee API key is set. */
export const is_govee_configured = (): boolean => Boolean(get_govee_api_key());

/* ------------------------------------------------------------------ */
/*  Core API helper                                                    */
/* ------------------------------------------------------------------ */

const govee_api = async ({
  path,
  method = "GET",
  body = null,
}: {
  path: string;
  method?: string;
  body?: Record<string, unknown> | null;
}): Promise<Record<string, unknown> | null> => {
  const api_key = get_govee_api_key();
  if (!api_key) throw new Error("Govee API key not configured.");

  const headers: Record<string, string> = {
    "Govee-API-Key": api_key,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${GOVEE_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error_text = await response.text().catch(() => "");
    throw new Error(`Govee API error ${response.status}: ${error_text.slice(0, 300)}`);
  }

  const data = await response.json().catch(() => null);
  return is_record(data) ? data : null;
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type govee_capability = {
  type: string;
  instance: string;
  parameters?: Record<string, unknown>;
};

export type govee_device = {
  sku: string;          // product model e.g. "H605C"
  device: string;       // device ID / MAC
  device_name: string;  // user-given name from Govee app
  type: string;         // e.g. "devices.types.light"
  capabilities: govee_capability[];
};

export type govee_action_result = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ */
/*  Device listing  (GET /router/api/v1/user/devices)                  */
/* ------------------------------------------------------------------ */

/** List all Govee devices registered to the account. */
export const govee_get_devices = async (): Promise<govee_device[]> => {
  const data = await govee_api({ path: "/router/api/v1/user/devices" });
  if (!data) return [];

  const raw_devices = Array.isArray(data["data"]) ? data["data"] : [];

  return (raw_devices as Record<string, unknown>[]).map((d) => ({
    sku: typeof d["sku"] === "string" ? d["sku"] : "",
    device: typeof d["device"] === "string" ? d["device"] : "",
    device_name: typeof d["deviceName"] === "string" ? d["deviceName"] : "Unknown",
    type: typeof d["type"] === "string" ? d["type"] : "",
    capabilities: Array.isArray(d["capabilities"])
      ? (d["capabilities"] as Record<string, unknown>[]).map((c) => ({
          type: typeof c["type"] === "string" ? c["type"] : "",
          instance: typeof c["instance"] === "string" ? c["instance"] : "",
          parameters: is_record(c["parameters"]) ? c["parameters"] : undefined,
        }))
      : [],
  }));
};

/* ------------------------------------------------------------------ */
/*  Device state  (POST /router/api/v1/device/state)                   */
/* ------------------------------------------------------------------ */

const govee_get_device_state = async ({
  sku,
  device,
}: {
  sku: string;
  device: string;
}): Promise<govee_action_result> => {
  const data = await govee_api({
    path: "/router/api/v1/device/state",
    method: "POST",
    body: {
      requestId: randomUUID(),
      payload: { sku, device },
    },
  });

  if (!data) return { ok: false, message: "Could not retrieve device state." };

  const payload = is_record(data["payload"]) ? data["payload"] : null;
  const capabilities = payload && Array.isArray(payload["capabilities"])
    ? (payload["capabilities"] as Record<string, unknown>[])
    : [];

  const state: Record<string, unknown> = {};
  for (const cap of capabilities) {
    const instance = typeof cap["instance"] === "string" ? cap["instance"] : "";
    const cap_state = is_record(cap["state"]) ? cap["state"] : null;
    const value = cap_state?.["value"];

    if (instance === "online") state["online"] = value;
    if (instance === "powerSwitch") state["power"] = value === 1 ? "on" : "off";
    if (instance === "brightness") state["brightness"] = value;
    if (instance === "colorRgb" && typeof value === "number") {
      state["color"] = {
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff,
      };
    }
    if (instance === "colorTemperatureK") state["color_temperature"] = value;
  }

  const is_on = state["power"] === "on";
  const brightness = typeof state["brightness"] === "number" ? state["brightness"] : null;
  const parts: string[] = [is_on ? "on" : "off"];
  if (brightness !== null) parts.push(`brightness ${brightness}%`);

  return { ok: true, message: `Light is ${parts.join(", ")}.`, data: state };
};

/* ------------------------------------------------------------------ */
/*  Device control  (POST /router/api/v1/device/control)               */
/* ------------------------------------------------------------------ */

const send_device_command = async ({
  sku,
  device,
  capability_type,
  instance,
  value,
}: {
  sku: string;
  device: string;
  capability_type: string;
  instance: string;
  value: unknown;
}): Promise<void> => {
  const result = await govee_api({
    path: "/router/api/v1/device/control",
    method: "POST",
    body: {
      requestId: randomUUID(),
      payload: {
        sku,
        device,
        capability: {
          type: capability_type,
          instance,
          value,
        },
      },
    },
  });

  // Log response for debugging
  const code = is_record(result) ? result["code"] : null;
  if (code && code !== 200) {
    const msg = is_record(result) && typeof result["msg"] === "string" ? result["msg"] : "unknown error";
    throw new Error(`Govee control failed (code ${code}): ${msg}`);
  }
};

/* ------------------------------------------------------------------ */
/*  Preferred device — persisted so it survives restarts               */
/* ------------------------------------------------------------------ */

const PREF_FILE = join(process.cwd(), ".govee_preferred_device");

type govee_preferred = { device: string; sku: string; name: string } | null;

const load_preferred_govee_device = (): govee_preferred => {
  try {
    const raw = readFileSync(PREF_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      device: typeof parsed["device"] === "string" ? parsed["device"] : "",
      sku: typeof parsed["sku"] === "string" ? parsed["sku"] : "",
      name: typeof parsed["name"] === "string" ? parsed["name"] : "",
    };
  } catch {
    return null;
  }
};

let preferred_govee_device: govee_preferred = load_preferred_govee_device();

export const get_preferred_govee_device = (): govee_preferred => preferred_govee_device;

export const set_preferred_govee_device = (pref: govee_preferred): void => {
  preferred_govee_device = pref;
  try {
    writeFileSync(PREF_FILE, pref ? JSON.stringify(pref) : "", "utf-8");
  } catch (err) {
    console.warn("[Govee] Failed to persist preferred device:", err);
  }
  console.log(`[Govee] Preferred device set to: ${pref?.name ?? "(none)"}`);
};

/* ------------------------------------------------------------------ */
/*  Resolve target devices (supports multiple)                         */
/* ------------------------------------------------------------------ */

/** Check if a device has a specific capability. */
const device_has_capability = (d: govee_device, cap_type: string): boolean =>
  d.capabilities.some((c) => c.type === cap_type);

/** Only keep light-type devices (or devices with on_off capability). */
const is_light_device = (d: govee_device): boolean =>
  d.type === "devices.types.light" ||
  device_has_capability(d, "devices.capabilities.on_off");

/**
 * Pick which devices to control. Returns an ARRAY — one tool call can
 * hit multiple lights at once.
 *
 * Resolution rules:
 *   1. device_name="all"  → every light device.
 *   2. device_name given  → ALL devices whose name contains the hint.
 *   3. No device_name     → ALL light devices.
 */
const resolve_target_govee_devices = (
  devices: govee_device[],
  device_name_hint?: string
): govee_device[] => {
  const lights = devices.filter(is_light_device);
  if (lights.length === 0) return [];

  if (!device_name_hint || device_name_hint.toLowerCase() === "all") {
    return lights;
  }

  const hint_lower = device_name_hint.toLowerCase();

  // Forward match: device name contains the hint
  const matches = lights.filter((d) =>
    d.device_name.toLowerCase().includes(hint_lower)
  );
  if (matches.length > 0) return matches;

  // Reverse match: hint contains a device name
  const reverse_matches = lights.filter((d) =>
    hint_lower.includes(d.device_name.toLowerCase())
  );
  if (reverse_matches.length > 0) return reverse_matches;

  // No matches — fall back to all lights
  return lights;
};

/* ------------------------------------------------------------------ */
/*  Color parsing helpers                                              */
/* ------------------------------------------------------------------ */

const COLOR_MAP: Record<string, { r: number; g: number; b: number }> = {
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  white: { r: 255, g: 255, b: 255 },
  warm: { r: 255, g: 180, b: 100 },
  "warm white": { r: 255, g: 180, b: 100 },
  "cool white": { r: 200, g: 220, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 165, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
  pink: { r: 255, g: 105, b: 180 },
  cyan: { r: 0, g: 255, b: 255 },
  teal: { r: 0, g: 128, b: 128 },
  magenta: { r: 255, g: 0, b: 255 },
  lavender: { r: 180, g: 130, b: 255 },
  coral: { r: 255, g: 127, b: 80 },
  gold: { r: 255, g: 215, b: 0 },
  lime: { r: 50, g: 205, b: 50 },
  aqua: { r: 0, g: 255, b: 255 },
  indigo: { r: 75, g: 0, b: 130 },
  violet: { r: 138, g: 43, b: 226 },
  peach: { r: 255, g: 218, b: 185 },
  mint: { r: 152, g: 255, b: 152 },
  sky: { r: 135, g: 206, b: 235 },
  "sky blue": { r: 135, g: 206, b: 235 },
  salmon: { r: 250, g: 128, b: 114 },
  crimson: { r: 220, g: 20, b: 60 },
  turquoise: { r: 64, g: 224, b: 208 },
};

/** Convert RGB to a single integer for the Govee v2 API (colorRgb). */
const rgb_to_int = (r: number, g: number, b: number): number =>
  ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

/**
 * Parse a color string into an integer for the Govee API.
 * Accepts: color names ("red"), hex ("#ff0000"), or "r,g,b".
 */
const parse_color = (color_str: string): number | null => {
  const normalized = color_str.trim().toLowerCase();

  if (COLOR_MAP[normalized]) {
    const { r, g, b } = COLOR_MAP[normalized]!;
    return rgb_to_int(r, g, b);
  }

  const hex_match = normalized.match(/^#?([0-9a-f]{6})$/);
  if (hex_match) {
    return parseInt(hex_match[1]!, 16);
  }

  const rgb_match = normalized.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (rgb_match) {
    return rgb_to_int(
      Math.min(255, parseInt(rgb_match[1]!, 10)),
      Math.min(255, parseInt(rgb_match[2]!, 10)),
      Math.min(255, parseInt(rgb_match[3]!, 10))
    );
  }

  return null;
};

/* ------------------------------------------------------------------ */
/*  Multi-device command helper                                        */
/* ------------------------------------------------------------------ */

const send_command_to_many = async (
  targets: govee_device[],
  capability_type: string,
  instance: string,
  value: unknown
): Promise<{ succeeded: string[]; failed: string[] }> => {
  const results = await Promise.allSettled(
    targets.map((t) =>
      send_device_command({
        sku: t.sku,
        device: t.device,
        capability_type,
        instance,
        value,
      }).then(() => t.device_name)
    )
  );

  const succeeded: string[] = [];
  const failed: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const name = targets[i]!.device_name;
    if (r.status === "fulfilled") {
      succeeded.push(name);
    } else {
      failed.push(name);
      console.error(`[Govee] Command failed for "${name}":`, r.reason);
    }
  }
  return { succeeded, failed };
};

const summarize_multi = (
  action_label: string,
  succeeded: string[],
  failed: string[]
): govee_action_result => {
  if (succeeded.length === 0 && failed.length > 0) {
    return { ok: false, message: `Failed to ${action_label} for: ${failed.join(", ")}.` };
  }
  const count = succeeded.length;
  const label =
    count === 1
      ? `"${succeeded[0]}"`
      : `${count} lights (${succeeded.join(", ")})`;
  const msg = failed.length > 0
    ? `${action_label} ${label}, but failed for: ${failed.join(", ")}.`
    : `${action_label} ${label}.`;
  return { ok: true, message: msg };
};

/* ------------------------------------------------------------------ */
/*  High-level actions (all support multiple devices)                  */
/* ------------------------------------------------------------------ */

const NO_DEVICES_MSG = "No Govee light devices found. Make sure your lights are set up in the Govee app.";

const govee_turn = async ({
  on,
  device_name,
}: {
  on: boolean;
  device_name?: string;
}): Promise<govee_action_result> => {
  const devices = await govee_get_devices();
  const targets = resolve_target_govee_devices(devices, device_name);
  if (targets.length === 0) return { ok: false, message: NO_DEVICES_MSG };

  console.log(`[Govee] Turning ${on ? "on" : "off"} ${targets.length} device(s): ${targets.map((t) => t.device_name).join(", ")}`);

  const { succeeded, failed } = await send_command_to_many(
    targets,
    "devices.capabilities.on_off",
    "powerSwitch",
    on ? 1 : 0
  );

  return summarize_multi(`Turned ${on ? "on" : "off"}`, succeeded, failed);
};

const govee_set_brightness = async ({
  brightness,
  device_name,
}: {
  brightness: number;
  device_name?: string;
}): Promise<govee_action_result> => {
  const devices = await govee_get_devices();
  const targets = resolve_target_govee_devices(devices, device_name);
  if (targets.length === 0) return { ok: false, message: NO_DEVICES_MSG };

  const capable = targets.filter((t) =>
    device_has_capability(t, "devices.capabilities.range")
  );
  if (capable.length === 0) return { ok: false, message: "None of the matched lights support brightness." };

  const safe_brightness = Math.max(1, Math.min(100, Math.round(brightness)));

  console.log(`[Govee] Setting brightness to ${safe_brightness}% on ${capable.length} device(s)`);

  const { succeeded, failed } = await send_command_to_many(
    capable,
    "devices.capabilities.range",
    "brightness",
    safe_brightness
  );

  return summarize_multi(`Set brightness to ${safe_brightness}% on`, succeeded, failed);
};

const govee_set_color = async ({
  color,
  device_name,
}: {
  color: string;
  device_name?: string;
}): Promise<govee_action_result> => {
  const color_int = parse_color(color);
  if (color_int === null) {
    return {
      ok: false,
      message: `Couldn't understand the color "${color}". Try a name like "blue" or "warm white", or a hex code like "#ff5500".`,
    };
  }

  const devices = await govee_get_devices();
  const targets = resolve_target_govee_devices(devices, device_name);
  if (targets.length === 0) return { ok: false, message: NO_DEVICES_MSG };

  const capable = targets.filter((t) =>
    device_has_capability(t, "devices.capabilities.color_setting")
  );
  if (capable.length === 0) return { ok: false, message: "None of the matched lights support color changes." };

  console.log(`[Govee] Setting color to ${color} (${color_int}) on ${capable.length} device(s)`);

  const { succeeded, failed } = await send_command_to_many(
    capable,
    "devices.capabilities.color_setting",
    "colorRgb",
    color_int
  );

  return summarize_multi(`Set to ${color} on`, succeeded, failed);
};

const govee_set_color_temperature = async ({
  temperature,
  device_name,
}: {
  temperature: number;
  device_name?: string;
}): Promise<govee_action_result> => {
  const devices = await govee_get_devices();
  const targets = resolve_target_govee_devices(devices, device_name);
  if (targets.length === 0) return { ok: false, message: NO_DEVICES_MSG };

  const capable = targets.filter((t) =>
    t.capabilities.some(
      (c) => c.type === "devices.capabilities.color_setting" && c.instance === "colorTemperatureK"
    )
  );
  if (capable.length === 0) return { ok: false, message: "None of the matched lights support color temperature." };

  const safe_temp = Math.max(2000, Math.min(9000, Math.round(temperature)));

  console.log(`[Govee] Setting color temperature to ${safe_temp}K on ${capable.length} device(s)`);

  const { succeeded, failed } = await send_command_to_many(
    capable,
    "devices.capabilities.color_setting",
    "colorTemperatureK",
    safe_temp
  );

  return summarize_multi(`Set color temperature to ${safe_temp}K on`, succeeded, failed);
};

const govee_get_status = async ({
  device_name,
}: {
  device_name?: string;
}): Promise<govee_action_result> => {
  const devices = await govee_get_devices();
  const targets = resolve_target_govee_devices(devices, device_name);
  if (targets.length === 0) return { ok: false, message: NO_DEVICES_MSG };

  const results = await Promise.allSettled(
    targets.map((t) =>
      govee_get_device_state({ sku: t.sku, device: t.device }).then(
        (r) => `${t.device_name}: ${r.message}`
      )
    )
  );

  const summaries = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  return {
    ok: true,
    message: summaries.length === 1 ? summaries[0]! : summaries.join(" | "),
  };
};

const govee_list = async (): Promise<govee_action_result> => {
  const devices = await govee_get_devices();
  if (devices.length === 0) {
    return { ok: true, message: "No Govee devices found on your account." };
  }

  const names = devices.map((d) => `${d.device_name} (${d.sku})`).join(", ");
  return {
    ok: true,
    message: `Found ${devices.length} device(s): ${names}`,
    data: { devices: devices.map((d) => ({ name: d.device_name, sku: d.sku, type: d.type })) },
  };
};

/* ------------------------------------------------------------------ */
/*  Main action dispatcher                                             */
/* ------------------------------------------------------------------ */

export const execute_govee_action = async ({
  action,
  color,
  brightness,
  color_temperature,
  device_name,
}: {
  action: string;
  color?: string;
  brightness?: number;
  color_temperature?: number;
  device_name?: string;
}): Promise<govee_action_result> => {
  try {
    switch (action) {
      case "turn_on":
        return await govee_turn({ on: true, device_name });
      case "turn_off":
        return await govee_turn({ on: false, device_name });
      case "brightness":
        return await govee_set_brightness({ brightness: brightness ?? 50, device_name });
      case "color":
        return await govee_set_color({ color: color ?? "white", device_name });
      case "color_temperature":
        return await govee_set_color_temperature({
          temperature: color_temperature ?? 4000,
          device_name,
        });
      case "status":
        return await govee_get_status({ device_name });
      case "list_devices":
        return await govee_list();
      default:
        return { ok: false, message: `Unknown light action: ${action}` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Light control failed.";
    console.error(`[Govee] ${action} failed:`, error);
    return { ok: false, message: msg };
  }
};
