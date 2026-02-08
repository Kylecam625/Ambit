import { useCallback, useEffect, useRef, useState } from "react";
import type { mic_device, voice_option } from "./realtime_types";
import { is_record } from "./realtime_types";

/**
 * Manages microphone device enumeration/selection and ElevenLabs voice
 * loading/selection. Completely independent of other realtime hooks.
 */
export const useMicAndVoice = () => {
  const [is_loading_mics, set_is_loading_mics] = useState(false);
  const [mic_devices, set_mic_devices] = useState<mic_device[]>([]);
  const [selected_mic_id, set_selected_mic_id] = useState<string | null>(null);
  const selected_mic_id_ref = useRef<string | null>(null);

  const [is_loading_voices, set_is_loading_voices] = useState(false);
  const [voice_options, set_voice_options] = useState<voice_option[]>([]);
  const [selected_voice_id, set_selected_voice_id] = useState<string | null>(null);
  const selected_voice_id_ref = useRef<string | null>(null);
  const [voice_error, set_voice_error] = useState<string | null>(null);

  // Keep refs in sync
  useEffect(() => {
    selected_mic_id_ref.current = selected_mic_id;
  }, [selected_mic_id]);

  useEffect(() => {
    selected_voice_id_ref.current = selected_voice_id;
  }, [selected_voice_id]);

  // Read saved selections after mount (SSR-safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved_mic = window.localStorage.getItem("ambit_selected_mic_id");
      if (saved_mic && !selected_mic_id_ref.current) {
        selected_mic_id_ref.current = saved_mic;
        set_selected_mic_id((current) => current ?? saved_mic);
      }
      const saved_voice = window.localStorage.getItem("ambit_selected_voice_id");
      if (saved_voice && !selected_voice_id_ref.current) {
        selected_voice_id_ref.current = saved_voice;
        set_selected_voice_id((current) => current ?? saved_voice);
      }
    } catch {
      // localStorage may be unavailable in SSR or private browsing; selections use defaults
    }
  }, []);

  const load_mics = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;

    set_is_loading_mics(true);
    let stream: MediaStream | null = null;

    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // getUserMedia may fail if mic permission not yet granted; we still enumerate available devices below
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audio_inputs = devices.filter((d) => d.kind === "audioinput");
      const next_mics = audio_inputs.map((d, i) => ({
        device_id: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));

      set_mic_devices(next_mics);

      const saved_mic_id =
        typeof window !== "undefined"
          ? localStorage.getItem("ambit_selected_mic_id")
          : null;

      set_selected_mic_id((current) => {
        if (current && next_mics.some((d) => d.device_id === current)) return current;
        if (saved_mic_id && next_mics.some((d) => d.device_id === saved_mic_id))
          return saved_mic_id;
        return null;
      });
    } catch (error) {
      console.warn("[Mic] Failed to enumerate microphone devices:", error);
    } finally {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      set_is_loading_mics(false);
    }
  }, []);

  const select_mic = useCallback((device_id: string | null) => {
    set_selected_mic_id(device_id);
  }, []);

  const load_voices = useCallback(async () => {
    set_is_loading_voices(true);
    set_voice_error(null);

    try {
      const response = await fetch("/api/elevenlabs/voices");
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to load voices";
        throw new Error(message);
      }

      const voices = Array.isArray(data?.voices) ? data.voices : [];
      const normalized: voice_option[] = voices
        .map((voice: unknown): voice_option => {
          if (!is_record(voice))
            return { voice_id: "", name: "Unknown", preview_url: null };
          return {
            voice_id: typeof voice["voice_id"] === "string" ? voice["voice_id"] : "",
            name: typeof voice["name"] === "string" ? voice["name"] : "Unknown",
            preview_url:
              typeof voice["preview_url"] === "string" ? voice["preview_url"] : null,
          };
        })
        .filter((v: voice_option) => v.voice_id.length > 0);

      set_voice_options(normalized);

      const default_voice_id =
        typeof data?.default_voice_id === "string" ? data.default_voice_id : null;
      const saved_voice_id =
        typeof window !== "undefined"
          ? localStorage.getItem("ambit_selected_voice_id")
          : null;

      set_selected_voice_id((current) => {
        if (current && normalized.some((v) => v.voice_id === current)) return current;
        if (saved_voice_id && normalized.some((v) => v.voice_id === saved_voice_id))
          return saved_voice_id;
        if (default_voice_id) return default_voice_id;
        return normalized[0]?.voice_id ?? null;
      });
    } catch (error) {
      set_voice_error(error instanceof Error ? error.message : "Failed to load voices");
    } finally {
      set_is_loading_voices(false);
    }
  }, []);

  const select_voice = useCallback((voice_id: string | null) => {
    set_selected_voice_id(voice_id);
  }, []);

  // Auto-load on mount
  useEffect(() => {
    void load_mics();
    void load_voices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    is_loading_mics,
    mic_devices,
    selected_mic_id,
    selected_mic_id_ref,
    is_loading_voices,
    voice_options,
    selected_voice_id,
    selected_voice_id_ref,
    voice_error,
    load_mics,
    select_mic,
    load_voices,
    select_voice,
  };
};
