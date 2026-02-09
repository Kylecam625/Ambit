"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { journal_movie, journal_movie_segment } from "@/lib/identity/identity_types";

type word_alignment = {
  word: string;
  start_time: number;
  end_time: number;
};

// Ken Burns animation presets
const KB_PRESETS = [
  { from: "scale(1.0) translate(0%, 0%)", to: "scale(1.15) translate(-3%, -2%)" },
  { from: "scale(1.1) translate(-2%, -1%)", to: "scale(1.0) translate(1%, 1%)" },
  { from: "scale(1.0) translate(2%, 0%)", to: "scale(1.12) translate(-1%, -3%)" },
  { from: "scale(1.1) translate(0%, -2%)", to: "scale(1.0) translate(-2%, 1%)" },
  { from: "scale(1.05) translate(-1%, 0%)", to: "scale(1.15) translate(2%, -2%)" },
];

type JournalMoviePlayerProps = {
  movie: journal_movie;
  on_close: () => void;
  on_regenerate: () => void;
};

export const JournalMoviePlayer = ({ movie, on_close, on_regenerate }: JournalMoviePlayerProps) => {
  const [is_playing, set_is_playing] = useState(false);
  const [current_time, set_current_time] = useState(0);
  const [duration, set_duration] = useState(0);
  const [current_segment_index, set_current_segment_index] = useState(0);
  const [current_word_index, set_current_word_index] = useState(-1);
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const animation_frame_ref = useRef<number | null>(null);

  // Parse movie data
  const segments: journal_movie_segment[] = useMemo(() => {
    try {
      return JSON.parse(movie.segments_json);
    } catch {
      return [];
    }
  }, [movie.segments_json]);

  const alignment: word_alignment[] = useMemo(() => {
    try {
      return JSON.parse(movie.alignment_json);
    } catch {
      return [];
    }
  }, [movie.alignment_json]);

  const [audio_error, set_audio_error] = useState<string | null>(null);

  // Track blob URL in a ref so it persists across strict-mode re-mounts
  const audio_blob_url_ref = useRef<string | null>(null);

  // Calculate segment boundaries based on word count proportions
  const segment_boundaries = useMemo(() => {
    if (segments.length === 0 || alignment.length === 0 || duration === 0) return [];

    // Count words per segment by matching alignment words to segment text
    const word_counts = segments.map((seg) => {
      const words = seg.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
      return words.length;
    });

    const total_words = word_counts.reduce((sum, c) => sum + c, 0);
    if (total_words === 0) return segments.map((_, i) => ({ start: (i / 5) * duration, end: ((i + 1) / 5) * duration }));

    const boundaries: { start: number; end: number }[] = [];
    let cumulative_fraction = 0;
    for (let i = 0; i < segments.length; i++) {
      const start = cumulative_fraction * duration;
      const fraction = word_counts[i] / total_words;
      cumulative_fraction += fraction;
      const end = Math.min(cumulative_fraction * duration, duration);
      boundaries.push({ start, end });
    }

    return boundaries;
  }, [segments, alignment, duration]);

  // Animation loop: sync captions and segment index to audio time
  const update_frame = useCallback(() => {
    const audio = audio_ref.current;
    if (!audio || audio.paused) {
      animation_frame_ref.current = null;
      return;
    }

    const t = audio.currentTime;
    set_current_time(t);

    // Update segment index
    for (let i = segment_boundaries.length - 1; i >= 0; i--) {
      if (t >= segment_boundaries[i].start) {
        set_current_segment_index(i);
        break;
      }
    }

    // Update word index
    let word_idx = -1;
    for (let i = 0; i < alignment.length; i++) {
      if (t >= alignment[i].start_time && t <= alignment[i].end_time + 0.15) {
        word_idx = i;
      }
    }
    set_current_word_index(word_idx);

    animation_frame_ref.current = requestAnimationFrame(update_frame);
  }, [segment_boundaries, alignment]);

  const toggle_play = useCallback(() => {
    const audio = audio_ref.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().then(() => {
        set_is_playing(true);
        animation_frame_ref.current = requestAnimationFrame(update_frame);
      }).catch(() => {});
    } else {
      audio.pause();
      set_is_playing(false);
      if (animation_frame_ref.current) {
        cancelAnimationFrame(animation_frame_ref.current);
        animation_frame_ref.current = null;
      }
    }
  }, [update_frame]);

  const handle_seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audio_ref.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    set_current_time(t);
  }, []);

  // Setup audio element and blob URL
  // IMPORTANT: blob URL is created inside this effect and stored in a ref
  // so React strict mode re-mounts don't revoke a URL that's still in use.
  useEffect(() => {
    if (!movie.audio_base64) {
      console.warn("[MoviePlayer] No audio_base64 in movie data");
      return;
    }

    // Reuse existing blob URL if audio data hasn't changed
    let blob_url = audio_blob_url_ref.current;
    if (!blob_url) {
      try {
        console.log(`[MoviePlayer] audio_base64 length: ${movie.audio_base64.length}`);
        const binary = atob(movie.audio_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        console.log(`[MoviePlayer] Audio decoded: ${bytes.length} bytes, first 4 bytes: [${bytes[0]}, ${bytes[1]}, ${bytes[2]}, ${bytes[3]}]`);
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        blob_url = URL.createObjectURL(blob);
        audio_blob_url_ref.current = blob_url;
        console.log(`[MoviePlayer] Blob URL created: ${blob_url}`);
      } catch (err) {
        console.error("[MoviePlayer] Failed to decode audio_base64:", err);
        set_audio_error("Audio data is corrupted. Try regenerating this movie.");
        return;
      }
    }

    const audio = new Audio(blob_url);
    audio_ref.current = audio;

    audio.onloadedmetadata = () => {
      console.log(`[MoviePlayer] Audio loaded, duration: ${audio.duration}s`);
      set_duration(audio.duration);
      set_audio_error(null);
    };

    audio.onerror = () => {
      const code = audio.error?.code;
      const msg = audio.error?.message || "unknown";
      // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
      console.error(`[MoviePlayer] Audio failed to load: code=${code}, message="${msg}"`);
      set_audio_error(`Audio failed to load (code ${code}). Try regenerating this movie.`);
    };

    audio.onended = () => {
      set_is_playing(false);
      set_current_time(0);
      set_current_segment_index(0);
      set_current_word_index(-1);
      if (animation_frame_ref.current) {
        cancelAnimationFrame(animation_frame_ref.current);
        animation_frame_ref.current = null;
      }
    };

    return () => {
      // Remove handlers BEFORE clearing src to avoid spurious onerror from ""
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.onended = null;
      audio.pause();
      audio.src = "";
      audio_ref.current = null;
      if (animation_frame_ref.current) {
        cancelAnimationFrame(animation_frame_ref.current);
      }
      // Do NOT revoke the blob URL here -- strict mode will re-mount
      // and needs the same URL. Revocation happens on unmount below.
    };
  }, [movie.audio_base64]);

  // Revoke blob URL only when the component truly unmounts or movie changes
  useEffect(() => {
    return () => {
      if (audio_blob_url_ref.current) {
        URL.revokeObjectURL(audio_blob_url_ref.current);
        audio_blob_url_ref.current = null;
      }
    };
  }, [movie.movie_id]);

  const format_time = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Ken Burns progress for current segment
  const kb_progress = useMemo(() => {
    if (segment_boundaries.length === 0) return 0;
    const boundary = segment_boundaries[current_segment_index];
    if (!boundary) return 0;
    const seg_duration = boundary.end - boundary.start;
    if (seg_duration <= 0) return 0;
    return Math.min(1, Math.max(0, (current_time - boundary.start) / seg_duration));
  }, [current_time, current_segment_index, segment_boundaries]);

  // Build caption words for current segment
  const caption_words = useMemo(() => {
    if (alignment.length === 0 || segment_boundaries.length === 0) return [];
    const boundary = segment_boundaries[current_segment_index];
    if (!boundary) return [];

    // Show words that fall within the current segment's time range
    return alignment
      .map((w, i) => ({ ...w, global_index: i }))
      .filter((w) => w.start_time >= boundary.start - 0.5 && w.start_time < boundary.end + 0.5);
  }, [alignment, current_segment_index, segment_boundaries]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-zinc-500">This movie has no content.</p>
        <button type="button" onClick={on_close} className="mt-4 text-sm text-amber-400 hover:underline cursor-pointer">Close</button>
      </div>
    );
  }

  const current_image = segments[current_segment_index]?.image_data_url;
  const next_segment_index = (current_segment_index + 1) % segments.length;
  const next_image = segments[next_segment_index]?.image_data_url;
  const kb = KB_PRESETS[current_segment_index % KB_PRESETS.length];

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Image display area */}
      <div className="relative w-full aspect-video bg-black overflow-hidden">
        {/* Current image with Ken Burns */}
        {current_image && (
          <div
            className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: 1 }}
          >
            <img
              src={current_image}
              alt={`Scene ${current_segment_index + 1}`}
              className="h-full w-full object-cover"
              style={{
                transform: `${kb.from}`.replace(
                  /scale\(([^)]+)\)/,
                  (_, from_scale) => {
                    const to_match = kb.to.match(/scale\(([^)]+)\)/);
                    const to_scale = to_match ? parseFloat(to_match[1]) : parseFloat(from_scale);
                    const interp = parseFloat(from_scale) + (to_scale - parseFloat(from_scale)) * kb_progress;
                    return `scale(${interp.toFixed(3)})`;
                  }
                ).replace(
                  /translate\(([^,]+),\s*([^)]+)\)/,
                  (_, from_x, from_y) => {
                    const to_match = kb.to.match(/translate\(([^,]+),\s*([^)]+)\)/);
                    const to_x = to_match ? parseFloat(to_match[1]) : parseFloat(from_x);
                    const to_y = to_match ? parseFloat(to_match[2]) : parseFloat(from_y);
                    const x = parseFloat(from_x) + (to_x - parseFloat(from_x)) * kb_progress;
                    const y = parseFloat(from_y) + (to_y - parseFloat(from_y)) * kb_progress;
                    return `translate(${x.toFixed(2)}%, ${y.toFixed(2)}%)`;
                  }
                ),
                transition: "transform 0.1s linear",
              }}
            />
          </div>
        )}

        {/* Preload next image */}
        {next_image && next_image !== current_image && (
          <img src={next_image} alt="" className="hidden" />
        )}

        {/* Gradient overlay for captions */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

        {/* Captions overlay */}
        <div className="absolute inset-x-0 bottom-4 px-8">
          <div
            className="text-center leading-relaxed"
            style={{
              textShadow: "0 0 4px rgba(0,0,0,0.95), 0 1px 6px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.4)",
            }}
          >
            {caption_words.map((w) => {
              const is_highlighted = w.global_index === current_word_index;
              const is_past = w.global_index < current_word_index;
              return (
                <span
                  key={w.global_index}
                  className={`
                    inline text-lg font-semibold transition-all duration-150
                    ${is_highlighted ? "text-amber-300 scale-105" : ""}
                    ${is_past ? "text-white/90" : ""}
                    ${!is_highlighted && !is_past ? "text-white/70" : ""}
                  `}
                  style={{
                    WebkitTextStroke: "0.5px rgba(0,0,0,0.6)",
                    paintOrder: "stroke fill",
                  }}
                >
                  {w.word}{" "}
                </span>
              );
            })}
          </div>
        </div>

        {/* Segment indicator dots */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {segments.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === current_segment_index ? "bg-amber-400" : "bg-white/30"
              }`}
            />
          ))}
        </div>

        {/* Version badge */}
        <div className="absolute top-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-zinc-400 backdrop-blur-sm">
          v{movie.version}
        </div>
      </div>

      {/* Audio error */}
      {audio_error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-red-400 shrink-0">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 4.75a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0v-3zM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
          </svg>
          <span className="text-xs text-red-300">{audio_error || "Audio failed to decode. Try regenerating this movie."}</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col gap-2 px-4 py-3 bg-zinc-900/80">
        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={current_time}
          onChange={handle_seek}
          className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400
            [&::-webkit-slider-thumb]:cursor-pointer"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={toggle_play}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
            >
              {is_playing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Time */}
            <span className="text-xs text-zinc-500 tabular-nums">
              {format_time(current_time)} / {format_time(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Regenerate */}
            <button
              type="button"
              onClick={on_regenerate}
              title="Regenerate movie"
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Regenerate
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={on_close}
              title="Close player"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
