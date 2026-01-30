"use client";

import { BarVisualizer, type AgentState } from "@/components/ui/bar_visualizer";
import { strip_elevenlabs_v3_audio_tags } from "@/lib/elevenlabs/elevenlabs_audio_tags";
import { strip_citations } from "@/lib/elevenlabs/strip_citations";

const state_to_classes = (state: AgentState) => {
  switch (state) {
    case "speaking":
      return {
        ring: "ring-emerald-400/30",
        bars: "bg-emerald-200/80",
        label: "Speaking",
      };
    case "thinking":
      return { ring: "ring-violet-400/25", bars: "bg-violet-200/70", label: "Thinking" };
    case "listening":
      return { ring: "ring-cyan-400/25", bars: "bg-cyan-200/70", label: "Listening" };
    case "connecting":
      return { ring: "ring-zinc-400/20", bars: "bg-zinc-200/60", label: "Connecting" };
    case "initializing":
    default:
      return { ring: "ring-zinc-400/20", bars: "bg-zinc-200/60", label: "Ready" };
  }
};

export const MouthDisplay = ({
  state,
  transcript,
  response_text,
  is_responding,
  is_connected,
  identity_label,
  tts_audio_element,
  layout = "auto",
}: {
  state: AgentState;
  transcript: string;
  response_text: string;
  is_responding: boolean;
  is_connected: boolean;
  identity_label: string;
  tts_audio_element: HTMLAudioElement | null;
  layout?: "auto" | "portrait" | "landscape";
}) => {
  const theme = state_to_classes(state);

  const trimmed_transcript = transcript.trim();
  const trimmed_response = strip_citations(strip_elevenlabs_v3_audio_tags(response_text)).trim();
  const response_line = is_responding ? "Thinking…" : trimmed_response;

  const identity = identity_label.trim() || "Anonymous";
  const connection = is_connected ? "online" : "offline";

  const is_landscape = layout === "landscape";
  const body_grid = is_landscape ? "grid-cols-[0.95fr_1.25fr]" : "grid-cols-1";

  return (
    <div
      className={`relative w-full rounded-[clamp(28px,6vw,56px)] border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900 p-[clamp(14px,3.2vw,22px)] shadow-2xl ring-1 ${theme.ring}`}
    >
      <div className="flex items-center justify-between text-[clamp(10px,1.4vw,12px)] text-zinc-400">
        <span className="font-medium tracking-[0.2em]">AMBIT</span>
        <div className="flex items-center gap-3">
          <span className="truncate max-w-[12rem]">{identity}</span>
          <span className="uppercase tracking-[0.18em] text-zinc-500">{connection}</span>
        </div>
      </div>

      <div className={`mt-[clamp(10px,2.2vw,18px)] grid gap-[clamp(10px,2vw,14px)] ${is_landscape ? "items-stretch" : ""}`}>
        <div className={`grid gap-[clamp(10px,2vw,14px)] ${body_grid}`}>
          <div className="rounded-[clamp(18px,4.2vw,28px)] border border-zinc-800 bg-black/30 p-[clamp(12px,2.6vw,18px)]">
            <p className="text-[clamp(10px,1.3vw,12px)] uppercase tracking-[0.22em] text-zinc-500">
            {theme.label}
            </p>
            <p className="mt-2 text-[clamp(13px,2.2vw,18px)] text-zinc-200 leading-snug line-clamp-4">
              {trimmed_transcript || "…"}
            </p>
          </div>

          <div className="rounded-[clamp(18px,4.2vw,28px)] border border-zinc-800 bg-black/35 p-[clamp(12px,2.6vw,18px)]">
            <p className="text-[clamp(10px,1.3vw,12px)] uppercase tracking-[0.22em] text-zinc-500">
              Ambit
            </p>
            <p className="mt-2 text-[clamp(16px,3vw,28px)] font-semibold text-zinc-50 leading-snug line-clamp-4">
              {response_line || "…"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-[clamp(10px,2.2vw,18px)] rounded-[clamp(18px,4.2vw,28px)] border border-zinc-800 bg-black/35 p-[clamp(12px,2.6vw,18px)]">
        <BarVisualizer
          state={state}
          audioElement={tts_audio_element}
          barCount={is_landscape ? 34 : 28}
          minHeight={10}
          maxHeight={95}
          className="h-[clamp(76px,16vw,150px)]"
          barClassName={theme.bars}
        />
      </div>
    </div>
  );
};

