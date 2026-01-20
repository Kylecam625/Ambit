import fs from "node:fs";
import path from "node:path";

let env_loaded = false;

const load_env_from_files = (): void => {
  if (env_loaded) {
    return;
  }

  env_loaded = true;

  const candidate_paths = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env.local"),
    path.join(process.cwd(), "..", ".env"),
  ];

  for (const file_path of candidate_paths) {
    if (!fs.existsSync(file_path)) {
      continue;
    }

    try {
      const contents = fs.readFileSync(file_path, "utf8");

      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const [key, ...rest] = trimmed.split("=");

        if (!key || rest.length === 0) {
          continue;
        }

        if (process.env[key] !== undefined) {
          continue;
        }

        const raw_value = rest.join("=").trim();
        const value = raw_value.replace(/^['"]|['"]$/g, "");
        process.env[key] = value;
      }
    } catch (error) {
      console.warn("Failed to read env file:", file_path, error);
    }
  }
};

const get_optional_voice_id = (): string | null => {
  load_env_from_files();
  return process.env.ELEVENLABS_VOICE_ID ?? process.env.ELEVEN_VOICE_ID ?? null;
};

export const get_elevenlabs_api_key = (): string => {
  load_env_from_files();
  const api_key = process.env.ELEVENLABS_API_KEY;

  if (!api_key) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  return api_key;
};

export const get_elevenlabs_voice_id = (): string => {
  const voice_id = get_optional_voice_id();

  if (!voice_id) {
    throw new Error("ELEVENLABS_VOICE_ID is not set");
  }

  return voice_id;
};

export const get_optional_elevenlabs_voice_id = (): string | null => {
  return get_optional_voice_id();
};

export const get_elevenlabs_model_id = (): string => {
  load_env_from_files();
  return (
    process.env.ELEVEN_TTS_MODEL ??
    process.env.ELEVENLABS_TTS_MODEL ??
    process.env.ELEVENLABS_MODEL ??
    "eleven_v3"
  );
};
