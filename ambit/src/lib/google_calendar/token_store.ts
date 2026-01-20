import path from "node:path";
import { promises as fs } from "node:fs";

type token_record = {
  refresh_token: string;
  updated_at_iso: string;
};

type token_store_file = {
  version: 1;
  by_profile_id: Record<string, token_record>;
};

const TOKEN_STORE_VERSION = 1 as const;

const to_string = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const to_profile_key = (profile_id: string | null): string => {
  const normalized = to_string(profile_id);
  return normalized ? normalized : "anonymous";
};

const get_store_path = (): string =>
  path.join(process.cwd(), ".data", "google_calendar_tokens.json");

const read_store_file = async (): Promise<token_store_file> => {
  try {
    const raw = await fs.readFile(get_store_path(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return { version: TOKEN_STORE_VERSION, by_profile_id: {} };
    }

    const record = parsed as Record<string, unknown>;
    const by_profile_id =
      typeof record["by_profile_id"] === "object" && record["by_profile_id"] !== null
        ? (record["by_profile_id"] as Record<string, unknown>)
        : {};

    const normalized: Record<string, token_record> = {};

    for (const [raw_key, raw_value] of Object.entries(by_profile_id)) {
      const key = to_string(raw_key);
      if (!key) continue;
      if (typeof raw_value !== "object" || raw_value === null) continue;
      const v = raw_value as Record<string, unknown>;
      const refresh_token = to_string(v["refresh_token"]);
      const updated_at_iso = to_string(v["updated_at_iso"]);
      if (!refresh_token || !updated_at_iso) continue;
      normalized[key] = { refresh_token, updated_at_iso };
    }

    return { version: TOKEN_STORE_VERSION, by_profile_id: normalized };
  } catch (error) {
    const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : null;
    if (code === "ENOENT") {
      return { version: TOKEN_STORE_VERSION, by_profile_id: {} };
    }
    return { version: TOKEN_STORE_VERSION, by_profile_id: {} };
  }
};

const write_store_file = async ({ store }: { store: token_store_file }): Promise<void> => {
  const store_path = get_store_path();
  const dir = path.dirname(store_path);
  await fs.mkdir(dir, { recursive: true });

  const next: token_store_file = {
    version: TOKEN_STORE_VERSION,
    by_profile_id: store.by_profile_id ?? {},
  };

  await fs.writeFile(store_path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
};

export const get_google_calendar_refresh_token = async ({
  profile_id,
}: {
  profile_id: string | null;
}): Promise<string | null> => {
  const store = await read_store_file();
  const key = to_profile_key(profile_id);
  const record = store.by_profile_id?.[key];
  const refresh_token = to_string(record?.refresh_token);
  return refresh_token ? refresh_token : null;
};

export const has_google_calendar_refresh_token = async ({
  profile_id,
}: {
  profile_id: string | null;
}): Promise<boolean> => {
  const token = await get_google_calendar_refresh_token({ profile_id });
  return Boolean(token);
};

export const set_google_calendar_refresh_token = async ({
  profile_id,
  refresh_token,
}: {
  profile_id: string | null;
  refresh_token: string;
}): Promise<void> => {
  const trimmed = to_string(refresh_token);
  if (!trimmed) return;

  const store = await read_store_file();
  const key = to_profile_key(profile_id);
  const next: token_store_file = {
    version: TOKEN_STORE_VERSION,
    by_profile_id: {
      ...(store.by_profile_id ?? {}),
      [key]: { refresh_token: trimmed, updated_at_iso: new Date().toISOString() },
    },
  };

  await write_store_file({ store: next });
};

export const delete_google_calendar_refresh_token = async ({
  profile_id,
}: {
  profile_id: string | null;
}): Promise<void> => {
  const store = await read_store_file();
  const key = to_profile_key(profile_id);
  const next_by_profile_id = { ...(store.by_profile_id ?? {}) };
  delete next_by_profile_id[key];

  await write_store_file({
    store: { version: TOKEN_STORE_VERSION, by_profile_id: next_by_profile_id },
  });
};

