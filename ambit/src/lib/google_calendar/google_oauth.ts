import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { google } from "googleapis";

let env_loaded = false;

const load_env_from_files = (): void => {
  if (env_loaded) return;
  env_loaded = true;

  const candidate_paths = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env.local"),
    path.join(process.cwd(), "..", ".env"),
  ];

  for (const file_path of candidate_paths) {
    if (!fs.existsSync(file_path)) continue;

    try {
      const contents = fs.readFileSync(file_path, "utf8");

      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const [key, ...rest] = trimmed.split("=");
        if (!key || rest.length === 0) continue;
        if (process.env[key] !== undefined) continue;

        const raw_value = rest.join("=").trim();
        const value = raw_value.replace(/^['"]|['"]$/g, "");
        process.env[key] = value;
      }
    } catch (error) {
      console.warn("Failed to read env file:", file_path, error);
    }
  }
};

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const GOOGLE_CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export const create_google_oauth_state = (): string => crypto.randomBytes(32).toString("hex");

export const get_google_client_id = (): string => {
  load_env_from_files();
  const client_id = to_string(process.env.GOOGLE_CLIENT_ID);
  if (!client_id) throw new Error("GOOGLE_CLIENT_ID is not set");
  return client_id;
};

export const get_google_client_secret = (): string => {
  load_env_from_files();
  const client_secret = to_string(process.env.GOOGLE_CLIENT_SECRET);
  if (!client_secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return client_secret;
};

export const get_google_oauth_redirect_url_override = (): string | null => {
  load_env_from_files();
  const override = to_string(process.env.GOOGLE_OAUTH_REDIRECT_URL);
  return override ? override : null;
};

export const get_google_oauth_redirect_url = ({ request_origin }: { request_origin: string }): string => {
  const override = get_google_oauth_redirect_url_override();
  if (override) return override;
  return `${request_origin}/api/google_calendar/callback`;
};

export const build_google_oauth2_client = ({ redirect_url }: { redirect_url: string }) => {
  const client_id = get_google_client_id();
  const client_secret = get_google_client_secret();
  return new google.auth.OAuth2(client_id, client_secret, redirect_url);
};

export const build_google_calendar_authorization_url = ({
  redirect_url,
  state,
}: {
  redirect_url: string;
  state: string;
}): string => {
  const client = build_google_oauth2_client({ redirect_url });
  return client.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_CALENDAR_SCOPES,
    include_granted_scopes: true,
    prompt: "consent",
    state,
  });
};

export type google_oauth_tokens = {
  refresh_token: string | null;
  access_token: string | null;
  scope: string | null;
  expiry_date_ms: number | null;
  token_type: string | null;
};

export const exchange_google_oauth_code_for_tokens = async ({
  redirect_url,
  code,
}: {
  redirect_url: string;
  code: string;
}): Promise<google_oauth_tokens> => {
  const trimmed_code = to_string(code);
  if (!trimmed_code) {
    return {
      refresh_token: null,
      access_token: null,
      scope: null,
      expiry_date_ms: null,
      token_type: null,
    };
  }

  const client = build_google_oauth2_client({ redirect_url });
  const { tokens } = await client.getToken(trimmed_code);

  return {
    refresh_token: typeof tokens.refresh_token === "string" ? tokens.refresh_token : null,
    access_token: typeof tokens.access_token === "string" ? tokens.access_token : null,
    scope: typeof tokens.scope === "string" ? tokens.scope : null,
    expiry_date_ms: typeof tokens.expiry_date === "number" ? tokens.expiry_date : null,
    token_type: typeof tokens.token_type === "string" ? tokens.token_type : null,
  };
};

