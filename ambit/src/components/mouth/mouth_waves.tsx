"use client";

import { BarVisualizer, type AgentState } from "@/components/ui/bar_visualizer";

const state_to_bar_class = (state: AgentState): string => {
  switch (state) {
    case "speaking":
      return "bg-emerald-200/85";
    case "thinking":
      return "bg-violet-200/70";
    case "listening":
      return "bg-cyan-200/70";
    default:
      return "bg-zinc-200/60";
  }
};

export const MouthWaves = ({
  state,
  tts_audio_element,
}: {
  state: AgentState;
  tts_audio_element: HTMLAudioElement | null;
}) => {
  const bar_class = state_to_bar_class(state);

  return (
    <div
      className="flex-1 border border-zinc-800 bg-gradient-to-b from-zinc-950 to-black shadow-2xl"
      style={{
        borderRadius: "var(--radius-wave)",
        padding: "var(--space-card-padding)",
      }}
      aria-hidden="true"
    >
      <div className="h-full w-full rounded-[clamp(44px,9vw,110px)] bg-black/40 p-[clamp(8px,2vw,16px)] ring-1 ring-zinc-700/40">
        <BarVisualizer
          state={state}
          audioElement={tts_audio_element}
          barCount={32}
          minHeight={10}
          maxHeight={98}
          className="h-full"
          barClassName={bar_class}
        />
      </div>
    </div>
  );
};

