export const REALTIME_AUDIO_SAMPLE_RATE = 24000;
export const REALTIME_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

// Reduced from 2048 to 1024 for lower latency (~42ms at 24kHz vs ~85ms)
// This works better with AudioWorklet's off-main-thread processing
export const REALTIME_AUDIO_PROCESSOR_BUFFER_SIZE = 1024;

export const REALTIME_SEMANTIC_VAD = {
  type: "semantic_vad" as const,
  // "high" = detect speech start as soon as possible (best for barge-in).
  // "auto"/"medium" = balanced. "low" = wait longer for user pauses.
  eagerness: "medium" as const,
  // We only use Realtime for transcription + turn detection.
  // Ambit generates responses via /api/realtime/respond.
  create_response: false,
  // interrupt_response tells OpenAI to cancel any active response stream
  // immediately on speech_started. This gives lower latency and cleaner state.
  // We still handle stopping ElevenLabs audio ourselves in the speech_started handler.
  interrupt_response: true,
};

export const build_realtime_transcription_session = () => ({
  type: "transcription" as const,
  audio: {
    input: {
      format: {
        type: "audio/pcm" as const,
        rate: REALTIME_AUDIO_SAMPLE_RATE,
      },
      transcription: {
        model: REALTIME_TRANSCRIPTION_MODEL,
        prompt: "Your name is Ambit",
      },
      turn_detection: {
        ...REALTIME_SEMANTIC_VAD,
      },
      noise_reduction: {
        type: "near_field" as const,
      },
    },
  },
});

