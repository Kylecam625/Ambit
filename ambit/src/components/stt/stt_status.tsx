export const SttStatus = ({
  is_recording,
  is_responding,
  is_transcribing,
}: {
  is_recording: boolean;
  is_responding: boolean;
  is_transcribing: boolean;
}) => {
  if (is_transcribing) {
    return <p className="text-sm text-zinc-400">Speaking detected...</p>;
  }

  if (is_responding) {
    return <p className="text-sm text-zinc-400">Thinking...</p>;
  }

  if (is_recording) {
    return <p className="text-sm text-zinc-400">Listening...</p>;
  }

  return <p className="text-sm text-zinc-400">Idle</p>;
};
