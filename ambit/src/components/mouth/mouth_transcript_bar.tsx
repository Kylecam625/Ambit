"use client";

export const MouthTranscriptBar = ({ transcript }: { transcript: string }) => {
  const t = transcript.trim();

  return (
    <div className="rounded-[clamp(18px,4vw,28px)] border border-zinc-800 bg-black/45 px-[clamp(12px,2.6vw,18px)] py-[clamp(10px,2.2vw,14px)]">
      <p className="text-[clamp(10px,1.3vw,12px)] uppercase tracking-[0.22em] text-zinc-500">
        Transcript
      </p>
      <p className="mt-2 text-[clamp(14px,2.4vw,22px)] font-medium text-zinc-100 leading-snug line-clamp-2">
        {t || "…"}
      </p>
    </div>
  );
};

