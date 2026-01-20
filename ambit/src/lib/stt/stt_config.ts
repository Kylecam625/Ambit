export const STT_MODEL = "gpt-4o-mini-transcribe";

export interface TranscriptionConfig {
  model: string;
  response_format: string;
}

export const get_default_stt_config = (): TranscriptionConfig => ({
  model: STT_MODEL,
  response_format: "text",
});
