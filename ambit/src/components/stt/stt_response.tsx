import { strip_elevenlabs_v3_audio_tags } from "@/lib/elevenlabs/elevenlabs_audio_tags";

export const SttResponse = ({
  error_message,
  is_responding,
  response,
}: {
  error_message: string | null;
  is_responding: boolean;
  response: string;
}) => {
  const display_response = strip_elevenlabs_v3_audio_tags(response);
  const message = is_responding
    ? "Thinking..."
    : display_response || "No response yet. Ask a question to get a reply.";

  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">Response</h2>
      </div>
      {error_message ? (
        <p className="text-sm text-red-400">{error_message}</p>
      ) : (
        <p className="min-h-[3rem] text-sm text-zinc-300">{message}</p>
      )}
    </section>
  );
};
