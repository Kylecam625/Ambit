"use client";

type ThinkingSoundsToggleProps = {
  enabled: boolean;
  on_change: (enabled: boolean) => void;
};

export const ThinkingSoundsToggle = ({
  enabled,
  on_change,
}: ThinkingSoundsToggleProps) => (
  <div className="flex flex-col gap-2">
    <label className="text-sm font-bold uppercase tracking-[0.15em] text-zinc-300">
      Loading Sounds
    </label>
    <button
      className={`flex w-full items-center justify-between rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
        enabled
          ? "border-cyan-400/60 bg-cyan-500/25 text-cyan-50"
          : "border-zinc-700 bg-black/80 text-zinc-300 hover:border-zinc-500"
      }`}
      onClick={() => on_change(!enabled)}
      type="button"
    >
      <span>{enabled ? "Enabled" : "Disabled"}</span>
      <div
        className={`relative h-6 w-11 rounded-full transition-colors ${
          enabled ? "bg-cyan-500" : "bg-zinc-700"
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
    <p className="text-xs text-zinc-400">
      Play ambient sounds while Ambit is thinking
    </p>
  </div>
);
