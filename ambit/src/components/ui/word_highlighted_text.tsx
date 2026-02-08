"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordAlignment = {
  word: string;
  start_time: number;
  end_time: number;
};

type WordBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const is_finite_number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const has_valid_alignment = (alignment: WordAlignment[] | null): alignment is WordAlignment[] =>
  Array.isArray(alignment) &&
  alignment.length > 0 &&
  alignment.every(
    (w) =>
      w &&
      typeof w.word === "string" &&
      is_finite_number(w.start_time) &&
      is_finite_number(w.end_time) &&
      w.end_time >= w.start_time
  );

const scale_for_distance = (distance: number): number => {
  if (distance <= 0) return 1.04;
  if (distance === 1) return 1.015;
  return 1.0;
};

const opacity_for_distance = (distance: number): number => {
  if (distance <= 0) return 1.0;
  if (distance === 1) return 0.9;
  if (distance === 2) return 0.82;
  return 0.74;
};

const build_word_boxes = ({
  count,
  word_elements,
}: {
  count: number;
  word_elements: Array<HTMLSpanElement | null>;
}): WordBox[] | null => {
  const next: WordBox[] = [];

  for (let i = 0; i < count; i++) {
    const el = word_elements[i];
    if (!el) {
      return null;
    }

    next.push({
      x: el.offsetLeft,
      y: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }

  return next;
};

const compute_highlight_box = (
  box: WordBox
): { left: number; top: number; width: number; height: number } => {
  // A pill *behind* the current word (more legible than a thin underline).
  const horizontal_padding = clamp(box.height * 0.22, 7, 14);
  const height = clamp(box.height * 0.92, 18, 34);
  const top = Math.round(box.y + (box.height - height) / 2);
  const left = Math.round(box.x - horizontal_padding);
  const width = Math.round(box.width + horizontal_padding * 2);

  return { left, top, width, height };
};

const find_active_word_index = ({
  time_s,
  alignment,
  previous_index,
}: {
  time_s: number;
  alignment: WordAlignment[];
  previous_index: number;
}): number => {
  if (!is_finite_number(time_s) || time_s < 0) return -1;
  if (alignment.length === 0) return -1;

  const first_start = alignment[0]?.start_time ?? 0;
  if (time_s < first_start) return -1;

  let index = previous_index;
  if (index < 0 || index >= alignment.length) index = 0;

  // We treat the "current word" as the latest word whose start_time <= time.
  // This avoids flicker/jumps when the alignment has small gaps between words.
  if (time_s < (alignment[index]?.start_time ?? 0)) {
    // Seek backward.
    while (index > 0 && time_s < (alignment[index]?.start_time ?? 0)) {
      index -= 1;
    }
    return index;
  }

  // Seek forward by start_time (not end_time) so gaps don't return -1.
  while (
    index < alignment.length - 1 &&
    time_s >= (alignment[index + 1]?.start_time ?? Number.POSITIVE_INFINITY)
  ) {
    index += 1;
  }

  return index;
};

export const WordHighlightedText = ({
  text,
  word_alignment,
  audio_element,
  className = "",
  style,
}: {
  text: string;
  word_alignment: WordAlignment[] | null;
  audio_element: HTMLAudioElement | null;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const word_refs = useRef<(HTMLSpanElement | null)[]>([]);
  const container_ref = useRef<HTMLParagraphElement>(null);
  const [measured_layout, set_measured_layout] = useState<{ key: string; boxes: WordBox[] } | null>(
    null
  );
  const [active_index, set_active_index] = useState(-1);
  const active_index_ref = useRef(-1);

  const alignment = useMemo(() => {
    return has_valid_alignment(word_alignment) ? word_alignment : null;
  }, [word_alignment]);

  const alignment_key = useMemo(() => {
    if (!alignment) return "";
    // Only used to ensure we never use stale measurements after alignment changes.
    return alignment.map((w) => w.word).join("\u0000");
  }, [alignment]);

  const words = useMemo(() => {
    if (alignment) return alignment.map((w) => w.word);
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return [];
    return trimmed.split(/\s+/);
  }, [alignment, text]);

  // Keep ref in sync so the RAF loop doesn't capture stale state.
  useEffect(() => {
    active_index_ref.current = active_index;
  }, [active_index]);

  const measure_words = useCallback(() => {
    if (!alignment) return;
    const container = container_ref.current;
    if (!container) return;

    const next = build_word_boxes({
      count: words.length,
      word_elements: word_refs.current,
    });

    if (!next) return;
    set_measured_layout({ key: alignment_key, boxes: next });
  }, [alignment, alignment_key, words.length]);

  // Measure word boxes after render (and whenever the word count changes).
  useEffect(() => {
    if (!alignment) return;
    if (words.length === 0) return;

    const raf = requestAnimationFrame(() => {
      measure_words();
    });

    return () => cancelAnimationFrame(raf);
  }, [alignment, measure_words, words.length]);

  // Re-measure when the container resizes (wrap changes, font size changes, etc).
  useEffect(() => {
    if (!alignment) return;
    if (typeof window === "undefined") return;

    const container = container_ref.current;
    if (!container) return;

    if (typeof ResizeObserver === "undefined") {
      const handle_resize = () => measure_words();
      window.addEventListener("resize", handle_resize);
      return () => window.removeEventListener("resize", handle_resize);
    }

    let raf_id = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf_id);
      raf_id = requestAnimationFrame(() => measure_words());
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(raf_id);
      observer.disconnect();
    };
  }, [alignment, measure_words]);

  // Track the active word index from the audio element.
  useEffect(() => {
    if (!audio_element || !alignment || alignment.length === 0) return;

    let animation_frame = 0;

    const tick = () => {
      const next_index = find_active_word_index({
        time_s: audio_element.currentTime,
        alignment,
        previous_index: active_index_ref.current,
      });

      if (next_index !== active_index_ref.current) {
        active_index_ref.current = next_index;
        set_active_index(next_index);
      }

      animation_frame = requestAnimationFrame(tick);
    };

    const handle_ended = () => {
      active_index_ref.current = -1;
      set_active_index(-1);
    };

    audio_element.addEventListener("ended", handle_ended);
    tick();

    return () => {
      cancelAnimationFrame(animation_frame);
      audio_element.removeEventListener("ended", handle_ended);
    };
  }, [audio_element, alignment]);

  // If we don't have alignment, just render the text plainly.
  if (!alignment) {
    return (
      <p className={`${className} select-none whitespace-pre-wrap`} style={style}>
        {typeof text === "string" ? text : ""}
      </p>
    );
  }

  const word_boxes = measured_layout?.key === alignment_key ? measured_layout.boxes : null;
  const effective_active_index = audio_element ? active_index : -1;

  const active_box =
    effective_active_index >= 0 && word_boxes && effective_active_index < word_boxes.length
      ? word_boxes[effective_active_index]
      : null;

  const highlight = active_box ? compute_highlight_box(active_box) : null;

  return (
    <p ref={container_ref} className={`${className} select-none relative pb-[0.55em]`} style={style}>
      <style>{`
@keyframes ambitKaraokePulse {
  0% { transform: translateZ(0) scale(1.04); }
  45% { transform: translateZ(0) scale(1.11); }
  100% { transform: translateZ(0) scale(1.04); }
}
      `}</style>

      {/* Single highlight pill that slides with the current word (x + y across wraps) */}
      <span
        aria-hidden
        className="absolute pointer-events-none rounded-md z-0"
        style={{
          top: 0,
          left: 0,
          opacity: highlight ? 1 : 0,
          width: highlight ? `${highlight.width}px` : "0px",
          height: highlight ? `${highlight.height}px` : "0px",
          transform: highlight
            ? `translate3d(${highlight.left}px, ${highlight.top}px, 0)`
            : "translate3d(0px, 0px, 0)",
          background: "rgba(167, 139, 250, 0.18)",
          border: "1.5px solid rgba(167, 139, 250, 0.35)",
          boxShadow: "none",
          transition:
            "transform 140ms linear, width 140ms linear, height 140ms linear, opacity 120ms ease-out",
          willChange: "transform, width, height, opacity",
        }}
      />

      {words.map((word, index) => {
        const distance =
          effective_active_index >= 0 ? Math.abs(index - effective_active_index) : 999;
        const scale = effective_active_index >= 0 ? scale_for_distance(distance) : 1.0;
        const opacity = effective_active_index >= 0 ? opacity_for_distance(distance) : 1.0;
        const is_active = distance === 0;
        const timing = alignment[index];
        const word_duration_s =
          timing && typeof timing.start_time === "number" && typeof timing.end_time === "number"
            ? clamp(timing.end_time - timing.start_time, 0.18, 1.6)
            : 0.45;

        return (
          <Fragment key={`${index}-${word}`}>
            <span
              ref={(el) => {
                word_refs.current[index] = el;
              }}
              className="relative z-10 inline-block will-change-transform"
              style={{
                marginRight: index < words.length - 1 ? "0.32em" : "0",
                transform: is_active ? "translateZ(0) scale(1)" : `translateZ(0) scale(${scale})`,
                opacity,
                transition: "transform 180ms ease-out, opacity 180ms ease-out",
                animation: is_active
                  ? `ambitKaraokePulse ${word_duration_s}s ease-in-out both`
                  : "none",
                textShadow: "none",
              }}
            >
              {word}
            </span>
            {/* spacing handled by marginRight above */}
          </Fragment>
        );
      })}
    </p>
  );
};
