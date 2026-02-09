"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type voice_item = {
  voice_id: string;
  name: string;
  preview_url: string | null;
  labels?: Record<string, string>;
};

type VoicePickerModalProps = {
  on_select: (selection: { voice_id: string; voice_name: string }) => void;
  on_close: () => void;
};

export const VoicePickerModal = ({ on_select, on_close }: VoicePickerModalProps) => {
  const [voices, set_voices] = useState<voice_item[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [selected_voice_id, set_selected_voice_id] = useState<string | null>(null);
  const [playing_preview, set_playing_preview] = useState<string | null>(null);
  const audio_ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const load_voices = async () => {
      try {
        const response = await fetch("/api/elevenlabs/voices");
        if (!response.ok) throw new Error("Failed to load voices");
        const data = await response.json();
        const voice_list = Array.isArray(data.voices) ? data.voices : [];
        set_voices(voice_list);
        if (data.default_voice_id) {
          set_selected_voice_id(data.default_voice_id);
        } else if (voice_list.length > 0) {
          set_selected_voice_id(voice_list[0].voice_id);
        }
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Failed to load voices");
      } finally {
        set_is_loading(false);
      }
    };
    load_voices();
  }, []);

  const handle_preview = useCallback((voice: voice_item) => {
    if (!voice.preview_url) return;

    if (playing_preview === voice.voice_id) {
      audio_ref.current?.pause();
      set_playing_preview(null);
      return;
    }

    if (audio_ref.current) {
      audio_ref.current.pause();
    }

    const audio = new Audio(voice.preview_url);
    audio_ref.current = audio;
    set_playing_preview(voice.voice_id);
    audio.onended = () => set_playing_preview(null);
    audio.onerror = () => set_playing_preview(null);
    audio.play().catch(() => set_playing_preview(null));
  }, [playing_preview]);

  const handle_confirm = useCallback(() => {
    if (!selected_voice_id) return;
    const voice = voices.find((v) => v.voice_id === selected_voice_id);
    if (!voice) return;
    if (audio_ref.current) audio_ref.current.pause();
    on_select({ voice_id: voice.voice_id, voice_name: voice.name });
  }, [selected_voice_id, voices, on_select]);

  const handle_close = useCallback(() => {
    if (audio_ref.current) audio_ref.current.pause();
    on_close();
  }, [on_close]);

  const format_labels = (labels?: Record<string, string>): string => {
    if (!labels) return "";
    const entries = Object.entries(labels).slice(0, 4);
    return entries.map(([, value]) => value).join(" · ");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Choose a Narrator Voice</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Select a voice to narrate your journal movie</p>
          </div>
          <button
            type="button"
            onClick={handle_close}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-3">
          {is_loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
              <span className="ml-3 text-sm text-zinc-400">Loading voices...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm text-red-400">{error}</div>
          )}

          {!is_loading && !error && voices.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-500">No voices available</div>
          )}

          {!is_loading && !error && voices.map((voice) => (
            <div
              key={voice.voice_id}
              role="button"
              tabIndex={0}
              onClick={() => set_selected_voice_id(voice.voice_id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); set_selected_voice_id(voice.voice_id); } }}
              className={`
                w-full flex items-center gap-3 rounded-xl px-4 py-3 mb-1.5 text-left transition-all cursor-pointer
                ${selected_voice_id === voice.voice_id
                  ? "bg-amber-500/15 border border-amber-500/30 ring-1 ring-amber-500/20"
                  : "bg-white/[0.02] border border-transparent hover:bg-white/5"
                }
              `}
            >
              {/* Radio indicator */}
              <div className={`
                flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors
                ${selected_voice_id === voice.voice_id
                  ? "border-amber-400 bg-amber-400"
                  : "border-zinc-600"
                }
              `}>
                {selected_voice_id === voice.voice_id && (
                  <div className="h-2 w-2 rounded-full bg-zinc-900" />
                )}
              </div>

              {/* Voice info */}
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-zinc-200 truncate">{voice.name}</span>
                {voice.labels && (
                  <span className="block text-xs text-zinc-500 mt-0.5 truncate">{format_labels(voice.labels)}</span>
                )}
              </div>

              {/* Preview button */}
              {voice.preview_url && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handle_preview(voice);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Preview voice"
                >
                  {playing_preview === voice.voice_id ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={handle_close}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handle_confirm}
            disabled={!selected_voice_id}
            className="rounded-lg bg-amber-500/20 px-5 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Generate Movie
          </button>
        </div>
      </div>
    </div>
  );
};
