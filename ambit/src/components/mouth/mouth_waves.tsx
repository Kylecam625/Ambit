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
    <div className="flex-1 rounded-[clamp(56px,10vw,120px)] border border-zinc-800 bg-gradient-to-b from-zinc-950 to-black p-[clamp(10px,2.2vw,18px)] shadow-2xl">
      <div className="h-full w-full rounded-[clamp(44px,9vw,110px)] bg-black/40 p-[clamp(8px,2vw,16px)] ring-1 ring-zinc-700/40">
        <BarVisualizer
          state={state}
          audioElement={tts_audio_element}
          barCount={52}
          minHeight={10}
          maxHeight={98}
          className="h-full"
          barClassName={bar_class}
        />
      </div>
    </div>
  );
};

