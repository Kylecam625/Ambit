import { BarVisualizer, type AgentState } from "@/components/ui/bar_visualizer";

export const SttVisualizer = ({
  is_connected,
  is_responding,
  is_speaking,
  is_tts_playing,
  tts_audio_element,
}: {
  is_connected: boolean;
  is_responding: boolean;
  is_speaking: boolean;
  is_tts_playing: boolean;
  tts_audio_element: HTMLAudioElement | null;
}) => {
  // Determine state
  const state: AgentState = is_responding
    ? "thinking"
    : is_tts_playing
      ? "speaking"
      : is_connected || is_speaking
        ? "listening"
        : "initializing";

  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">Ambit</h2>
        <span className="text-xs text-zinc-400 capitalize">{state}</span>
      </div>
      <BarVisualizer 
        state={state} 
        audioElement={tts_audio_element}
        className="h-28" 
      />
    </section>
  );
};
