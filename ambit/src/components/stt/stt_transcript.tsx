export const SttTranscript = ({
  error_message,
  transcript,
}: {
  error_message: string | null;
  transcript: string;
}) => {
  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">Transcript</h2>
      </div>
      {error_message ? (
        <p className="text-sm text-red-400">{error_message}</p>
      ) : (
        <p className="min-h-[3rem] text-sm text-zinc-300">
          {transcript || "No transcript yet. Record audio to test speech-to-text."}
        </p>
      )}
    </section>
  );
};
