"use client";

export const MouthTranscriptBar = ({ transcript }: { transcript: string }) => {
  const t = transcript.trim();

  // Hide when there's nothing to show
  if (!t) return null;

  return (
    <div
      aria-live="polite"
      className="glass-panel max-w-[min(560px,90vw)] rounded-lg px-6 py-3 animate-fade-in-up"
    >
      <p
        className="text-center text-[15px] font-semibold text-zinc-200 leading-snug line-clamp-2"
      >
        {t}
      </p>
    </div>
  );
};
