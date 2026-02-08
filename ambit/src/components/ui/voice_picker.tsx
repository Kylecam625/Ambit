import type { HTMLAttributes } from "react";
import { useMemo, useRef, useState } from "react";

export type VoicePickerVoice = {
  voice_id: string;
  name: string;
  preview_url: string | null;
};

type voice_picker_props = HTMLAttributes<HTMLDivElement> & {
  voices: VoicePickerVoice[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const VoicePicker = ({
  voices,
  value,
  onValueChange,
  placeholder = "Select a voice...",
  open,
  onOpenChange,
  className,
  ...props
}: voice_picker_props) => {
  const [is_open_internal, set_is_open_internal] = useState(false);
  const [search_value, set_search_value] = useState("");
  const [playing_voice_id, set_playing_voice_id] = useState<string | null>(null);
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const is_open = open ?? is_open_internal;

  const selected_voice = useMemo(
    () => voices.find((voice) => voice.voice_id === value),
    [voices, value]
  );

  const filtered_voices = useMemo(() => {
    const query = search_value.trim().toLowerCase();

    if (!query) {
      return voices;
    }

    return voices.filter((voice) => voice.name.toLowerCase().includes(query));
  }, [search_value, voices]);

  const set_open = (next_open: boolean) => {
    if (open === undefined) {
      set_is_open_internal(next_open);
    }

    onOpenChange?.(next_open);

    if (!next_open) {
      set_search_value("");
      if (audio_ref.current) {
        audio_ref.current.pause();
        audio_ref.current.currentTime = 0;
      }
      set_playing_voice_id(null);
    }
  };

  const handle_toggle = () => {
    set_open(!is_open);
  };

  const handle_select = (voice_id: string) => {
    onValueChange?.(voice_id);
    set_open(false);
  };

  const handle_play = (voice: VoicePickerVoice) => {
    if (!voice.preview_url) {
      return;
    }

    const audio = audio_ref.current ?? new Audio();
    audio_ref.current = audio;

    if (playing_voice_id === voice.voice_id) {
      audio.pause();
      audio.currentTime = 0;
      set_playing_voice_id(null);
      return;
    }

    audio.src = voice.preview_url;
    audio.onended = () => set_playing_voice_id(null);
    audio.onerror = () => set_playing_voice_id(null);
    set_playing_voice_id(voice.voice_id);
    void audio.play().catch(() => set_playing_voice_id(null));
  };

  return (
    <div className={className} {...props}>
      <button
        className="w-full rounded-lg border-2 border-zinc-700 bg-black/80 px-4 py-2.5 text-left text-sm font-bold text-zinc-100 hover:border-zinc-500"
        onClick={handle_toggle}
        type="button"
      >
        {selected_voice?.name ?? placeholder}
      </button>
      {is_open ? (
        <div className="mt-2 rounded-lg border-2 border-zinc-700 bg-zinc-950 p-2 shadow-sm">
          <input
            className="w-full rounded-md border-2 border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm font-semibold text-zinc-100 focus:border-zinc-500 focus:outline-none"
            onChange={(event) => set_search_value(event.target.value)}
            placeholder="Search voices..."
            type="text"
            value={search_value}
          />
          <div className="mt-3 max-h-64 overflow-y-auto">
            {filtered_voices.length === 0 ? (
              <p className="px-2 py-3 text-sm text-zinc-500">No voices found.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {filtered_voices.map((voice) => {
                  const is_selected = voice.voice_id === value;
                  const is_playing = voice.voice_id === playing_voice_id;
                  return (
                    <div
                      key={voice.voice_id}
                      className={`flex items-center justify-between rounded-md border-2 px-3 py-2 ${
                        is_selected ? "border-zinc-100" : "border-zinc-700"
                      }`}
                    >
                      <button
                        className="flex-1 text-left text-sm font-bold text-white"
                        onClick={() => handle_select(voice.voice_id)}
                        type="button"
                      >
                        {voice.name}
                      </button>
                      {voice.preview_url ? (
                        <button
                          className="ml-2 rounded-md border-2 border-zinc-600 px-3 py-1 text-xs font-bold text-zinc-200"
                          onClick={() => handle_play(voice)}
                          type="button"
                        >
                          {is_playing ? "Stop" : "Preview"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
