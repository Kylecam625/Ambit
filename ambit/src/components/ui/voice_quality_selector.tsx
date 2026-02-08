"use client";

type VoiceQualitySelectorProps = {
  quality: "quality" | "fast";
  on_change: (quality: "quality" | "fast") => void;
};

export const VoiceQualitySelector = ({
  quality,
  on_change,
}: VoiceQualitySelectorProps) => (
  <div className="flex flex-col gap-2">
    <label className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
      Voice Mode
    </label>
    <div className="flex gap-2">
      <button
        className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
          quality === "quality"
            ? "border-cyan-400/60 bg-cyan-500/25 text-cyan-50"
            : "border-zinc-700 bg-black/80 text-zinc-300 hover:border-zinc-500"
        }`}
        onClick={() => on_change("quality")}
        type="button"
      >
        Quality
      </button>
      <button
        className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
          quality === "fast"
            ? "border-cyan-400/60 bg-cyan-500/25 text-cyan-50"
            : "border-zinc-700 bg-black/80 text-zinc-300 hover:border-zinc-500"
        }`}
        onClick={() => on_change("fast")}
        type="button"
      >
        Fast
      </button>
    </div>
    <p className="text-xs text-zinc-400">
      {quality === "quality"
        ? "v3 with emotional audio tags (slower)"
        : "Flash v2.5, faster responses (no audio tags)"}
    </p>
  </div>
);
