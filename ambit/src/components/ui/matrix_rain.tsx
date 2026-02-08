"use client";

import { useEffect, useRef } from "react";
import type { UiMood } from "./orb";

const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>{}[]";

const FONT_SIZE = 13;
const COLUMN_GAP = FONT_SIZE + 3;
const DROP_SPEED_MIN = 0.3;
const DROP_SPEED_MAX = 1.0;
const FADE_ALPHA = 0.06; // higher = trails fade faster = darker overall

// Multi-color palette — each column picks one at random
const COLOR_PALETTE: readonly [number, number, number][] = [
  [130, 80, 220],   // deep purple
  [0, 200, 220],    // cyan
  [60, 120, 255],   // electric blue
  [200, 140, 50],   // dim amber
  [160, 50, 210],   // violet
  [0, 180, 160],    // teal
  [80, 60, 180],    // indigo
];

// Mood-specific color palettes
const MOOD_PALETTES: Record<UiMood, readonly [number, number, number][]> = {
  neutral: COLOR_PALETTE,
  excited: [
    [245, 158, 11],  // amber
    [239, 68, 68],   // red
    [245, 200, 50],  // gold
    [255, 120, 30],  // orange
    [220, 50, 50],   // crimson
  ],
  calm: [
    [6, 182, 212],   // cyan
    [59, 130, 246],  // blue
    [20, 160, 200],  // teal-blue
    [100, 160, 240], // light blue
    [40, 200, 180],  // teal
  ],
  intense: [
    [239, 68, 68],   // red
    [220, 38, 38],   // dark red
    [180, 20, 20],   // deep red
    [255, 100, 50],  // red-orange
    [200, 30, 80],   // crimson-rose
  ],
  playful: [
    [236, 72, 153],  // pink
    [245, 158, 11],  // amber
    [168, 85, 247],  // purple
    [52, 211, 153],  // green
    [99, 102, 241],  // indigo
  ],
  warm: [
    [249, 115, 22],  // orange
    [234, 179, 8],   // yellow
    [245, 158, 11],  // amber
    [200, 100, 20],  // deep orange
    [220, 160, 30],  // gold
  ],
  mysterious: [
    [124, 58, 237],  // violet
    [30, 27, 75],    // deep indigo
    [80, 40, 200],   // dark purple
    [60, 20, 160],   // deep violet
    [100, 60, 220],  // purple
  ],
  sad: [
    [99, 102, 241],  // indigo
    [71, 85, 105],   // slate
    [60, 80, 160],   // muted blue
    [80, 90, 120],   // grey-blue
    [50, 60, 140],   // dark indigo
  ],
};

interface Drop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
  color: readonly [number, number, number];
}

function random_char(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function random_color(palette: readonly [number, number, number][] = COLOR_PALETTE): readonly [number, number, number] {
  return palette[Math.floor(Math.random() * palette.length)];
}

function create_drop(x: number, canvas_h: number, palette?: readonly [number, number, number][]): Drop {
  const length = Math.floor(Math.random() * 20) + 6;
  return {
    x,
    y: -Math.random() * canvas_h,
    speed: DROP_SPEED_MIN + Math.random() * (DROP_SPEED_MAX - DROP_SPEED_MIN),
    chars: Array.from({ length }, () => random_char()),
    length,
    color: random_color(palette),
  };
}

export function MatrixRain({ opacity = 0.08, mood = "neutral" }: { opacity?: number; mood?: UiMood }) {
  const canvas_ref = useRef<HTMLCanvasElement>(null);
  const drops_ref = useRef<Drop[]>([]);
  const raf_ref = useRef<number>(0);
  const mood_ref = useRef<UiMood>(mood);
  mood_ref.current = mood;

  useEffect(() => {
    const canvas = canvas_ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;

      const col_count = Math.floor(w / COLUMN_GAP);
      drops_ref.current = Array.from({ length: col_count }, (_, i) =>
        create_drop(i * COLUMN_GAP + COLUMN_GAP / 2, h)
      );
    }

    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!ctx) return;

      // Darker fade — trails vanish quicker
      ctx.fillStyle = `rgba(12, 12, 18, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${FONT_SIZE}px "Geist Mono", "SF Mono", "Fira Code", monospace`;

      for (const drop of drops_ref.current) {
        const [r, g, b] = drop.color;

        for (let j = 0; j < drop.length; j++) {
          const char_y = drop.y - j * FONT_SIZE;
          if (char_y < -FONT_SIZE || char_y > h + FONT_SIZE) continue;

          const age = j / drop.length;
          const brightness = 1 - age * 0.9;

          if (j === 0) {
            // Leading char — bright tinted white with glow
            const wr = Math.min(255, r + 120);
            const wg = Math.min(255, g + 120);
            const wb = Math.min(255, b + 120);
            ctx.fillStyle = `rgba(${wr}, ${wg}, ${wb}, ${brightness * 0.9})`;
            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.6)`;
            ctx.shadowBlur = 8;
          } else if (j < 3) {
            // Near-head — full color, subtle glow
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${brightness * 0.7})`;
            ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.25)`;
            ctx.shadowBlur = 4;
          } else {
            // Tail — dimmed, no glow
            const dim = 0.35;
            ctx.fillStyle = `rgba(${Math.floor(r * dim)}, ${Math.floor(g * dim)}, ${Math.floor(b * dim)}, ${brightness * 0.35})`;
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          }

          // Occasional character flicker
          if (Math.random() < 0.003) {
            drop.chars[j] = random_char();
          }

          ctx.fillText(drop.chars[j], drop.x, char_y);
        }

        drop.y += drop.speed;

        // Reset off-screen drops with a fresh color from the active mood palette
        if (drop.y - drop.length * FONT_SIZE > h) {
          const active_palette = MOOD_PALETTES[mood_ref.current] ?? COLOR_PALETTE;
          const new_drop = create_drop(drop.x, h, active_palette);
          drop.y = -Math.random() * FONT_SIZE * 6;
          drop.speed = new_drop.speed;
          drop.chars = new_drop.chars;
          drop.length = new_drop.length;
          drop.color = new_drop.color;
        }
      }

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      raf_ref.current = requestAnimationFrame(draw);
    }

    raf_ref.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf_ref.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvas_ref}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 1, opacity }}
      aria-hidden="true"
    />
  );
}
