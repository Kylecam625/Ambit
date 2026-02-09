/**
 * Spotify config file utilities.
 *
 * Stores Spotify OAuth credentials in `.spotify_config.json` at the project root
 * so users can set up Spotify from the Settings UI without editing .env files.
 *
 * The config file is gitignored and local to each machine.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_FILE = join(process.cwd(), ".spotify_config.json");

export type spotify_config = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

const EMPTY_CONFIG: spotify_config = {
  client_id: "",
  client_secret: "",
  refresh_token: "",
};

/** Read the Spotify config file. Returns empty strings for missing fields. */
export const load_spotify_config = (): spotify_config => {
  try {
    if (!existsSync(CONFIG_FILE)) return { ...EMPTY_CONFIG };
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      client_id: typeof data["client_id"] === "string" ? data["client_id"].trim() : "",
      client_secret: typeof data["client_secret"] === "string" ? data["client_secret"].trim() : "",
      refresh_token: typeof data["refresh_token"] === "string" ? data["refresh_token"].trim() : "",
    };
  } catch {
    return { ...EMPTY_CONFIG };
  }
};

/** Merge partial updates into the config file and write to disk. */
export const save_spotify_config = (partial: Partial<spotify_config>): void => {
  const current = load_spotify_config();
  const merged: spotify_config = {
    client_id: partial.client_id?.trim() ?? current.client_id,
    client_secret: partial.client_secret?.trim() ?? current.client_secret,
    refresh_token: partial.refresh_token?.trim() ?? current.refresh_token,
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
  console.log("[Spotify] Config saved to .spotify_config.json");
};

/** Delete the config file (disconnect). */
export const delete_spotify_config = (): void => {
  try {
    if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
      console.log("[Spotify] Config file deleted.");
    }
  } catch (err) {
    console.warn("[Spotify] Failed to delete config file:", err);
  }
};

/** Check whether the config file has client credentials (step 1 of setup). */
export const has_client_credentials = (): boolean => {
  const { client_id, client_secret } = load_spotify_config();
  return Boolean(client_id && client_secret);
};

/** Check whether the config file has a refresh token (setup complete). */
export const has_refresh_token = (): boolean => {
  const { refresh_token } = load_spotify_config();
  return Boolean(refresh_token);
};
