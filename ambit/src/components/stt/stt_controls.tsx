import { useState } from "react";
import { SttStatus } from "@/components/stt/stt_status";
import { VoicePicker } from "@/components/ui/voice_picker";

export const SttControls = ({
  is_loading_mics,
  is_loading_voices,
  is_recording,
  is_responding,
  is_transcribing,
  mic_devices,
  on_load_voices,
  on_load_mics,
  on_select_voice,
  on_select_mic,
  on_start,
  on_stop,
  on_reset,
  on_reset_conversation,
  selected_mic_id,
  selected_voice_id,
  voice_error,
  voice_options,
}: {
  is_loading_mics: boolean;
  is_loading_voices: boolean;
  is_recording: boolean;
  is_responding: boolean;
  is_transcribing: boolean;
  mic_devices: Array<{ device_id: string; label: string }>;
  on_load_voices: () => Promise<void> | void;
  on_load_mics: () => Promise<void> | void;
  on_select_voice: (voice_id: string | null) => void;
  on_select_mic: (device_id: string | null) => void;
  on_start: () => void;
  on_stop: () => void;
  on_reset: () => void;
  on_reset_conversation?: () => void;
  selected_mic_id: string | null;
  selected_voice_id: string | null;
  voice_error: string | null;
  voice_options: Array<{ voice_id: string; name: string; preview_url: string | null }>;
}) => {
  const [is_mic_picker_open, set_is_mic_picker_open] = useState(false);
  const [is_voice_picker_open, set_is_voice_picker_open] = useState(false);
  const is_start_disabled = is_recording || is_transcribing;
  const is_stop_disabled = !is_recording || is_transcribing;
  const is_mic_disabled = is_recording || is_transcribing || is_loading_mics;
  const is_voice_disabled = is_recording || is_transcribing || is_loading_voices;
  const selected_mic_label =
    mic_devices.find((device) => device.device_id === selected_mic_id)?.label ??
    "System default";

  const handle_toggle_mic_picker = async () => {
    const next_state = !is_mic_picker_open;
    set_is_mic_picker_open(next_state);

    if (next_state) {
      await on_load_mics();
    }
  };

  const handle_voice_open_change = async (next_open: boolean) => {
    set_is_voice_picker_open(next_open);

    if (next_open) {
      await on_load_voices();
    }
  };

  return (
    <section className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          disabled={is_start_disabled}
          onClick={on_start}
          type="button"
        >
          Start
        </button>
        <button
          className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
          disabled={is_stop_disabled}
          onClick={on_stop}
          type="button"
        >
          Stop
        </button>
        <button
          className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
          disabled={is_recording || is_transcribing}
          onClick={on_reset}
          type="button"
        >
          Clear transcript
        </button>
        {on_reset_conversation ? (
          <button
            className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
            disabled={is_recording || is_transcribing}
            onClick={on_reset_conversation}
            type="button"
          >
            Reset chat
          </button>
        ) : null}
        <button
          className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
          disabled={is_mic_disabled}
          onClick={handle_toggle_mic_picker}
          type="button"
        >
          {is_loading_mics ? "Loading mics..." : "Select mic"}
        </button>
        <span className="text-xs text-zinc-400">Mic: {selected_mic_label}</span>
      </div>
      {is_mic_picker_open ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full border border-zinc-700 px-4 py-1 text-xs font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
            disabled={is_mic_disabled}
            onClick={() => on_select_mic(null)}
            type="button"
          >
            System default
          </button>
          {mic_devices.map((device) => (
            <button
              key={device.device_id}
              className={`rounded-full border px-4 py-1 text-xs font-semibold ${
                device.device_id === selected_mic_id
                  ? "border-zinc-100 text-zinc-100"
                  : "border-zinc-700 text-zinc-300"
              } disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500`}
              disabled={is_mic_disabled}
              onClick={() => on_select_mic(device.device_id)}
              type="button"
            >
              {device.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Voice
          </p>
          {voice_error ? (
            <span className="text-xs text-red-400">{voice_error}</span>
          ) : null}
        </div>
        <VoicePicker
          className={is_voice_disabled ? "pointer-events-none opacity-60" : undefined}
          onOpenChange={handle_voice_open_change}
          onValueChange={(voice_id) => on_select_voice(voice_id || null)}
          open={is_voice_picker_open}
          placeholder={is_loading_voices ? "Loading voices..." : "Select a voice..."}
          value={selected_voice_id ?? ""}
          voices={voice_options}
        />
      </div>
      <SttStatus
        is_recording={is_recording}
        is_responding={is_responding}
        is_transcribing={is_transcribing}
      />
    </section>
  );
};
