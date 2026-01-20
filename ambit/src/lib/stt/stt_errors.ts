export class TranscriptionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "TranscriptionError";
  }
}

export const normalize_stt_error = ({
  error,
}: {
  error: unknown;
}): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unexpected transcription error.";
};
