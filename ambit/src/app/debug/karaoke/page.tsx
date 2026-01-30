"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WordHighlightedText } from "@/components/ui/word_highlighted_text";
import type { ElevenLabsWordAlignment } from "@/lib/elevenlabs/elevenlabs_alignment_to_words";
import { parse_elevenlabs_stream_with_timestamps_jsonl } from "@/lib/elevenlabs/elevenlabs_alignment_to_words";

type voice_option = { voice_id: string; name: string; preview_url: string | null };

const DEFAULT_DEMO_TEXT =
  "This is a karaoke subtitle demo for testing multi-line word highlighting. The underline should track each word across line wraps, and the word scaling should feel smooth and stable.";

export default function KaraokeDebugPage() {
  const [voices, set_voices] = useState<voice_option[]>([]);
  const [selected_voice_id, set_selected_voice_id] = useState<string | null>(null);
  const [text, set_text] = useState(DEFAULT_DEMO_TEXT);
  const [status, set_status] = useState<string | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [word_alignment, set_word_alignment] = useState<ElevenLabsWordAlignment[] | null>(null);
  const [caption_text, set_caption_text] = useState<string>("");
  const [audio_element, set_audio_element] = useState<HTMLAudioElement | null>(null);

  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const audio_url_ref = useRef<string | null>(null);

  const stop_audio = useCallback(() => {
    const audio = audio_ref.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (audio_url_ref.current) {
      URL.revokeObjectURL(audio_url_ref.current);
      audio_url_ref.current = null;
    }

    set_audio_element(null);
    set_word_alignment(null);
    set_caption_text("");
    set_status(null);
  }, []);

  useEffect(() => {
    void (async () => {
      set_error(null);
      try {
        const response = await fetch("/api/elevenlabs/voices");
        const data = (await response.json().catch(() => null)) as
          | { voices?: voice_option[]; default_voice_id?: string | null; error?: string }
          | null;

        if (!response.ok) {
          const message = typeof data?.error === "string" ? data.error : "Failed to load voices";
          throw new Error(message);
        }

        const list = Array.isArray(data?.voices) ? data.voices : [];
        set_voices(list);

        const saved =
          typeof window !== "undefined" ? window.localStorage.getItem("ambit_selected_voice_id") : null;
        const saved_trimmed = typeof saved === "string" ? saved.trim() : "";
        const preferred =
          saved_trimmed ||
          (typeof data?.default_voice_id === "string" ? data.default_voice_id : "") ||
          (list[0]?.voice_id ?? "");

        set_selected_voice_id(preferred || null);
      } catch (e) {
        set_error(e instanceof Error ? e.message : "Failed to load voices");
      }
    })();
  }, []);

  const can_speak = useMemo(() => {
    return Boolean(selected_voice_id && text.trim().length > 0);
  }, [selected_voice_id, text]);

  const speak = useCallback(async () => {
    const trimmed = text.trim();
    const voice_id = selected_voice_id;

    if (!voice_id || !trimmed) return;

    stop_audio();
    set_error(null);
    set_status("Requesting TTS…");

    try {
      const response = await fetch("/api/realtime/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voice_id,
          quality_mode: "quality",
          optimize_latency: 2,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = typeof data?.error === "string" ? data.error : "TTS failed";
        throw new Error(message);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      set_status("Streaming + parsing alignment…");

      const parsed = await parse_elevenlabs_stream_with_timestamps_jsonl({ reader });
      if (!parsed) throw new Error("TTS parse aborted");

      const url = URL.createObjectURL(new Blob([parsed.audio_bytes], { type: "audio/mpeg" }));
      audio_url_ref.current = url;

      const audio = audio_ref.current ?? new Audio();
      audio_ref.current = audio;
      set_audio_element(audio);
      audio.src = url;

      if (parsed.word_alignment && parsed.caption_text) {
        set_word_alignment(parsed.word_alignment);
        set_caption_text(parsed.caption_text);
      } else {
        set_word_alignment(null);
        set_caption_text(trimmed);
      }

      set_status("Playing…");
      await audio.play();
      audio.onended = () => {
        set_status(null);
        if (audio_url_ref.current) {
          URL.revokeObjectURL(audio_url_ref.current);
          audio_url_ref.current = null;
        }
      };
    } catch (e) {
      set_error(e instanceof Error ? e.message : "Failed to play TTS");
      set_status(null);
    }
  }, [selected_voice_id, stop_audio, text]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-[980px] px-[clamp(10px,2.6vw,18px)] py-[clamp(14px,3vw,28px)]">
        <div className="rounded-[clamp(22px,4vw,32px)] border border-zinc-800/80 bg-black/35 p-[clamp(10px,2.6vw,18px)] shadow-2xl ring-1 ring-white/5">
          <p className="text-[clamp(10px,1.3vw,12px)] uppercase tracking-[0.22em] text-zinc-500">
            Karaoke debug
          </p>

          <div className="mt-3 grid gap-3">
            <div className="grid gap-2">
              <label className="text-xs text-zinc-400">Voice</label>
              <select
                className="w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                value={selected_voice_id ?? ""}
                onChange={(e) => set_selected_voice_id(e.target.value || null)}
              >
                <option value="" disabled>
                  Select a voice…
                </option>
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs text-zinc-400">Text</label>
              <textarea
                className="min-h-[7.5rem] w-full resize-y rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                value={text}
                onChange={(e) => set_text(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-5 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void speak()}
                disabled={!can_speak}
              >
                Speak
              </button>
              <button
                type="button"
                className="rounded-full border border-zinc-700 bg-zinc-950/40 px-5 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-600"
                onClick={stop_audio}
              >
                Stop
              </button>

              {status ? <span className="text-sm text-zinc-400">{status}</span> : null}
              {error ? <span className="text-sm text-red-300">{error}</span> : null}
            </div>

            <div className="rounded-[clamp(18px,4vw,28px)] border border-zinc-800 bg-black/45 px-[clamp(12px,2.6vw,18px)] py-[clamp(12px,2.6vw,18px)]">
              <p className="text-[clamp(10px,1.3vw,12px)] uppercase tracking-[0.22em] text-zinc-500">
                Preview
              </p>
              <div className="mt-2">
                <WordHighlightedText
                  text={caption_text || text.trim() || "…"}
                  word_alignment={word_alignment}
                  audio_element={audio_element}
                  className="text-[clamp(14px,2.2vw,20px)] font-medium text-zinc-100 leading-snug"
                />
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              Tip: widen/narrow the window to test wrapping; the underline should track across lines.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

