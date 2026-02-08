"use client";

import { useCallback, useRef, useState } from "react";

export type qa_message = { role: "user" | "assistant"; content: string };

type use_journal_qa_options = {
  profile_name: string;
  entry_date: string;
  mood?: string | null;
  voice_id?: string | null;
};

type use_journal_qa_return = {
  transcript: qa_message[];
  is_recording: boolean;
  is_processing: boolean;
  is_generating: boolean;
  is_speaking: boolean;
  current_question: string | null;
  generated_html: string | null;
  error: string | null;
  start_session: () => Promise<void>;
  start_recording: () => void;
  stop_recording: () => void;
  generate_now: () => Promise<void>;
};

export const useJournalQA = ({
  profile_name,
  entry_date,
  mood,
  voice_id,
}: use_journal_qa_options): use_journal_qa_return => {
  const [transcript, set_transcript] = useState<qa_message[]>([]);
  const [is_recording, set_is_recording] = useState(false);
  const [is_processing, set_is_processing] = useState(false);
  const [is_generating, set_is_generating] = useState(false);
  const [is_speaking, set_is_speaking] = useState(false);
  const [current_question, set_current_question] = useState<string | null>(null);
  const [generated_html, set_generated_html] = useState<string | null>(null);
  const [error, set_error] = useState<string | null>(null);

  const media_recorder_ref = useRef<MediaRecorder | null>(null);
  const audio_chunks_ref = useRef<Blob[]>([]);
  const audio_element_ref = useRef<HTMLAudioElement | null>(null);
  const transcript_ref = useRef<qa_message[]>([]);

  // Keep ref in sync with state for closures
  const update_transcript = useCallback((updater: (prev: qa_message[]) => qa_message[]) => {
    set_transcript((prev) => {
      const next = updater(prev);
      transcript_ref.current = next;
      return next;
    });
  }, []);

  // ── Speak Ambit's question via TTS ──
  const speak_text = useCallback(
    async (text: string): Promise<void> => {
      set_is_speaking(true);
      try {
        const res = await fetch("/api/realtime/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice_id: voice_id || undefined,
            quality_mode: "fast",
          }),
        });

        if (!res.ok || !res.body) {
          set_is_speaking(false);
          return;
        }

        // Parse the ElevenLabs JSONL stream to extract audio
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const audio_chunks: string[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.audio_base64) {
                audio_chunks.push(parsed.audio_base64);
              }
            } catch {
              // skip non-JSON lines
            }
          }
        }

        if (audio_chunks.length > 0) {
          // Combine base64 audio chunks into a single audio blob
          const binary_strings = audio_chunks.map((chunk) => atob(chunk));
          const total_length = binary_strings.reduce((sum, s) => sum + s.length, 0);
          const combined = new Uint8Array(total_length);
          let offset = 0;
          for (const str of binary_strings) {
            for (let i = 0; i < str.length; i++) {
              combined[offset++] = str.charCodeAt(i);
            }
          }

          const blob = new Blob([combined], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);

          await new Promise<void>((resolve) => {
            const audio = new Audio(url);
            audio_element_ref.current = audio;
            audio.onended = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.play().catch(() => resolve());
          });
        }
      } catch (err) {
        console.warn("[JournalQA] TTS error:", err);
      } finally {
        set_is_speaking(false);
      }
    },
    [voice_id]
  );

  // ── Fetch next question from Ambit ──
  const fetch_next_question = useCallback(
    async (current_transcript: qa_message[]): Promise<{ question: string; is_complete: boolean }> => {
      const res = await fetch("/api/journal/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile_name,
          date: entry_date,
          mood: mood || null,
          transcript: current_transcript,
        }),
      });

      if (!res.ok) throw new Error("Failed to get next question.");
      return await res.json();
    },
    [profile_name, entry_date, mood]
  );

  // ── Ask a question and speak it ──
  const ask_question = useCallback(
    async (current_transcript: qa_message[]) => {
      set_is_processing(true);
      set_error(null);
      try {
        const { question, is_complete } = await fetch_next_question(current_transcript);
        set_current_question(question);

        // Add to transcript
        update_transcript((prev) => [...prev, { role: "assistant", content: question }]);

        // Speak the question
        await speak_text(question);

        if (is_complete) {
          // Auto-generate the journal
          await do_generate([...current_transcript, { role: "assistant", content: question }]);
        }
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        set_is_processing(false);
      }
    },
    [fetch_next_question, speak_text, update_transcript]
  );

  // ── Generate journal from transcript ──
  const do_generate = useCallback(
    async (final_transcript: qa_message[]) => {
      set_is_generating(true);
      set_error(null);
      try {
        const res = await fetch("/api/journal/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profile_name,
            date: entry_date,
            transcript: final_transcript,
          }),
        });

        if (!res.ok) throw new Error("Failed to generate journal.");
        const data = await res.json();
        set_generated_html(data.html || "");
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Failed to generate journal.");
      } finally {
        set_is_generating(false);
      }
    },
    [profile_name, entry_date]
  );

  // ── Start a new journal Q&A session ──
  const start_session = useCallback(async () => {
    set_transcript([]);
    transcript_ref.current = [];
    set_generated_html(null);
    set_error(null);
    set_current_question(null);

    // Ask the first question
    await ask_question([]);
  }, [ask_question]);

  // ── Start recording user audio ──
  const start_recording = useCallback(() => {
    set_error(null);
    audio_chunks_ref.current = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        media_recorder_ref.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audio_chunks_ref.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Stop all tracks to release mic
          stream.getTracks().forEach((t) => t.stop());

          const blob = new Blob(audio_chunks_ref.current, { type: "audio/webm" });
          if (blob.size < 100) {
            set_error("Recording too short. Try again.");
            return;
          }

          set_is_processing(true);
          try {
            // Transcribe
            const form_data = new FormData();
            form_data.append("file", blob, "recording.webm");
            const stt_res = await fetch("/api/stt", {
              method: "POST",
              body: form_data,
            });

            if (!stt_res.ok) throw new Error("Transcription failed.");
            const stt_data = await stt_res.json();
            const user_text = (stt_data.text || "").trim();

            if (!user_text) {
              set_error("Couldn't catch that. Try again.");
              set_is_processing(false);
              return;
            }

            // Add user response to transcript
            const updated = [...transcript_ref.current, { role: "user" as const, content: user_text }];
            update_transcript(() => updated);

            // Get next question
            await ask_question(updated);
          } catch (err) {
            set_error(err instanceof Error ? err.message : "Something went wrong.");
            set_is_processing(false);
          }
        };

        recorder.start();
        set_is_recording(true);
      })
      .catch((err) => {
        set_error("Microphone access denied.");
        console.warn("[JournalQA] Mic error:", err);
      });
  }, [ask_question, update_transcript]);

  // ── Stop recording ──
  const stop_recording = useCallback(() => {
    const recorder = media_recorder_ref.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
    set_is_recording(false);
  }, []);

  // ── Manual generate ──
  const generate_now = useCallback(async () => {
    const current = transcript_ref.current;
    if (current.length === 0) {
      set_error("No conversation yet. Answer some questions first.");
      return;
    }
    await do_generate(current);
  }, [do_generate]);

  return {
    transcript,
    is_recording,
    is_processing,
    is_generating,
    is_speaking,
    current_question,
    generated_html,
    error,
    start_session,
    start_recording,
    stop_recording,
    generate_now,
  };
};
