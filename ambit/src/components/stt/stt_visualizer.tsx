import { BarVisualizer, type AgentState } from "@/components/ui/bar_visualizer";

export const SttVisualizer = ({
  is_connected,
  is_responding,
  is_speaking,
  is_tts_playing,
  tts_audio_element,
  identity_label,
  identity_kind,
}: {
  is_connected: boolean;
  is_responding: boolean;
  is_speaking: boolean;
  is_tts_playing: boolean;
  tts_audio_element: HTMLAudioElement | null;
  identity_label?: string;
  identity_kind?: "ok" | "warn" | "bad";
}) => {
  // Determine state
  const state: AgentState = is_responding
    ? "thinking"
    : is_tts_playing
      ? "speaking"
      : is_connected || is_speaking
        ? "listening"
        : "initializing";

  const identity_text = typeof identity_label === "string" ? identity_label.trim() : "";
  const identity_classes =
    identity_kind === "ok"
      ? "border-emerald-700/50 text-emerald-300"
      : identity_kind === "bad"
        ? "border-red-700/50 text-red-300"
        : "border-zinc-700 text-zinc-300";

  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">Ambit</h2>
        <div className="flex items-center gap-2">
          {identity_text ? (
            <span className={`rounded-full border px-2 py-1 text-xs ${identity_classes}`}>
              Identity: {identity_text}
            </span>
          ) : null}
          <span className="text-xs text-zinc-400 capitalize">{state}</span>
        </div>
      </div>
      <BarVisualizer 
        state={state} 
        audioElement={tts_audio_element}
        className="h-28" 
      />
    </section>
  );
};
