"use client";

import type { AgentState } from "./bar_visualizer";

export type UiMood = "neutral" | "excited" | "calm" | "intense" | "playful" | "warm" | "mysterious" | "sad";

type StateStyle = {
  bg: string;
  border: string;
  glow: string;
};

const state_styles: Record<string, StateStyle> = {
  listening: {
    bg: "linear-gradient(145deg, rgba(245,158,11,0.35) 0%, rgba(10,8,6,0.95) 100%)",
    border: "rgba(245,158,11,0.50)",
    glow: "0 0 30px rgba(245,158,11,0.12)",
  },
  thinking: {
    bg: "linear-gradient(145deg, rgba(168,85,247,0.35) 0%, rgba(10,8,14,0.95) 100%)",
    border: "rgba(168,85,247,0.50)",
    glow: "0 0 30px rgba(168,85,247,0.12)",
  },
  speaking: {
    bg: "linear-gradient(145deg, rgba(52,211,153,0.35) 0%, rgba(8,14,10,0.95) 100%)",
    border: "rgba(52,211,153,0.50)",
    glow: "0 0 30px rgba(52,211,153,0.12)",
  },
};

const idle_style: StateStyle = {
  bg: "linear-gradient(145deg, rgba(245,158,11,0.20) 0%, rgba(8,8,14,0.95) 100%)",
  border: "rgba(245,158,11,0.35)",
  glow: "none",
};

// Mood overlays — blend the mood color into the orb's glow
const mood_glow: Record<UiMood, string> = {
  neutral: "",
  excited: "0 0 50px rgba(245,158,11,0.25), 0 0 100px rgba(239,68,68,0.12)",
  calm: "0 0 50px rgba(6,182,212,0.20), 0 0 100px rgba(59,130,246,0.10)",
  intense: "0 0 50px rgba(239,68,68,0.30), 0 0 100px rgba(220,38,38,0.15)",
  playful: "0 0 50px rgba(236,72,153,0.25), 0 0 100px rgba(245,158,11,0.12)",
  warm: "0 0 50px rgba(249,115,22,0.25), 0 0 100px rgba(234,179,8,0.12)",
  mysterious: "0 0 50px rgba(124,58,237,0.30), 0 0 100px rgba(30,27,75,0.15)",
  sad: "0 0 50px rgba(99,102,241,0.15), 0 0 100px rgba(71,85,105,0.08)",
};

const get_style = (state: AgentState): StateStyle =>
  state_styles[state] ?? idle_style;

const get_animation = (state: AgentState, mood: UiMood): string => {
  // Mood-specific animation adjustments
  const speed_factor = mood === "excited" || mood === "intense" ? 0.7 : mood === "calm" || mood === "sad" ? 1.5 : 1;

  switch (state) {
    case "thinking":
      return `orb-pulse ${2.5 * speed_factor}s ease-in-out infinite`;
    case "listening":
    case "speaking":
      return `orb-breathe ${3 * speed_factor}s ease-in-out infinite`;
    default:
      return `orb-breathe ${5 * speed_factor}s ease-in-out infinite`;
  }
};

export const Orb = ({
  state,
  mood = "neutral",
  onClick,
  className = "",
  children,
}: {
  state: AgentState;
  mood?: UiMood;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) => {
  const s = get_style(state);
  const extra_glow = mood !== "neutral" ? mood_glow[mood] : "";
  const combined_glow = [s.glow, extra_glow].filter(Boolean).join(", ") || "none";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`relative flex cursor-pointer items-center justify-center outline-none ${className}`}
      style={{ width: "var(--orb-size)", height: "var(--orb-size)" }}
      aria-label={`Ambit - ${state}`}
    >
      <div
        className="h-full w-full rounded-xl"
        style={{
          background: s.bg,
          border: `2px solid ${s.border}`,
          boxShadow: combined_glow,
          transition:
            "background 0.5s ease, border-color 0.5s ease, box-shadow 1s ease",
          animation: get_animation(state, mood),
        }}
      />
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
};
