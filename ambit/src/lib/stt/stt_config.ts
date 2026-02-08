import { DEFAULT_STT_MODEL } from "@/lib/constants/models";

/** Re-export so existing imports keep working. */
export const STT_MODEL = DEFAULT_STT_MODEL;

export interface TranscriptionConfig {
  model: string;
  response_format: string;
  /** BCP-47 language hint – improves accuracy & latency. */
  language?: string;
}

export const get_default_stt_config = (): TranscriptionConfig => ({
  model: DEFAULT_STT_MODEL,
  response_format: "text",
  language: "en",
});
