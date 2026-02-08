"use client";

import { useJournalQA, type qa_message } from "@/hooks/use_journal_qa";
import { useEffect, useRef } from "react";

type JournalVoiceQAProps = {
  profile_name: string;
  entry_date: string;
  mood?: string | null;
  voice_id?: string | null;
  on_journal_generated: (html: string, transcript: qa_message[]) => void;
  on_cancel: () => void;
};

const MessageBubble = ({ msg }: { msg: qa_message }) => {
  const is_ambit = msg.role === "assistant";
  return (
    <div className={`flex ${is_ambit ? "justify-start" : "justify-end"}`}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
          ${is_ambit
            ? "bg-amber-500/10 text-amber-100 border border-amber-500/20 rounded-tl-md"
            : "bg-white/10 text-zinc-200 border border-white/10 rounded-tr-md"
          }
        `}
      >
        <span className={`block text-[10px] font-semibold mb-1 ${is_ambit ? "text-amber-400/70" : "text-zinc-500"}`}>
          {is_ambit ? "Ambit" : "You"}
        </span>
        {msg.content}
      </div>
    </div>
  );
};

const PulsingDot = () => (
  <span className="inline-flex items-center gap-1">
    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse [animation-delay:150ms]" />
    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse [animation-delay:300ms]" />
  </span>
);

export const JournalVoiceQA = ({
  profile_name,
  entry_date,
  mood,
  voice_id,
  on_journal_generated,
  on_cancel,
}: JournalVoiceQAProps) => {
  const {
    transcript,
    is_recording,
    is_processing,
    is_generating,
    is_speaking,
    generated_html,
    error,
    start_session,
    start_recording,
    stop_recording,
    generate_now,
  } = useJournalQA({ profile_name, entry_date, mood, voice_id });

  // Auto-start the session (guard against React Strict Mode double-mount)
  const has_started_ref = useRef(false);
  useEffect(() => {
    if (has_started_ref.current) return;
    has_started_ref.current = true;
    start_session();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When journal is generated, pass it up
  useEffect(() => {
    if (generated_html) {
      on_journal_generated(generated_html, transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated_html]);

  const day_label = new Date(entry_date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const has_user_responses = transcript.some((m) => m.role === "user");

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Journal Session</h3>
          <p className="text-xs text-zinc-500">{day_label}</p>
        </div>
        <div className="flex items-center gap-2">
          {has_user_responses && !is_generating && (
            <button
              type="button"
              onClick={generate_now}
              className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer"
            >
              Generate Journal
            </button>
          )}
          <button
            type="button"
            onClick={on_cancel}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[300px] max-h-[50vh]">
        {transcript.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {/* Status indicators */}
        {is_processing && !is_speaking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-md bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <span className="block text-[10px] font-semibold mb-1 text-amber-400/70">Ambit</span>
              <PulsingDot />
            </div>
          </div>
        )}

        {is_speaking && (
          <div className="flex items-center gap-2 text-xs text-amber-400/60 px-1">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="animate-pulse">
              <path d="M8 1a2 2 0 0 0-2 2v5a2 2 0 0 0 4 0V3a2 2 0 0 0-2-2zM4 7a1 1 0 0 0-2 0 6 6 0 0 0 5 5.91V14H5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1H9v-1.09A6 6 0 0 0 14 7a1 1 0 0 0-2 0 4 4 0 0 1-8 0z" />
            </svg>
            Ambit is speaking...
          </div>
        )}

        {is_generating && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-10 w-10 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
            <p className="text-sm text-amber-200/70">Writing your journal...</p>
          </div>
        )}
      </div>

      {/* Recording controls */}
      {!is_generating && !generated_html && (
        <div className="border-t border-white/10 px-5 py-4">
          {error && (
            <p className="mb-3 text-xs text-red-400 text-center">{error}</p>
          )}

          <div className="flex items-center justify-center gap-4">
            {!is_recording ? (
              <button
                type="button"
                onClick={start_recording}
                disabled={is_processing || is_speaking}
                className={`
                  flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all cursor-pointer
                  ${is_processing || is_speaking
                    ? "bg-white/5 text-zinc-500 cursor-not-allowed"
                    : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 hover:scale-105"
                  }
                `}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a2 2 0 0 0-2 2v5a2 2 0 0 0 4 0V3a2 2 0 0 0-2-2z" />
                  <path d="M4 7a1 1 0 0 0-2 0 6 6 0 0 0 5 5.91V14H5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1H9v-1.09A6 6 0 0 0 14 7a1 1 0 0 0-2 0 4 4 0 0 1-8 0z" />
                </svg>
                {is_processing ? "Processing..." : is_speaking ? "Listening..." : "Hold to speak"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stop_recording}
                className="flex items-center gap-2 rounded-full bg-red-500/20 px-6 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/30 transition-all animate-pulse cursor-pointer"
              >
                <span className="h-3 w-3 rounded-sm bg-red-400" />
                Stop recording
              </button>
            )}
          </div>

          <p className="mt-3 text-center text-[11px] text-zinc-500">
            {is_recording
              ? "Speak your answer, then tap stop when done"
              : is_speaking
                ? "Wait for Ambit to finish speaking..."
                : is_processing
                  ? "Processing your response..."
                  : "Tap the button and answer Ambit's question"
            }
          </p>
        </div>
      )}
    </div>
  );
};
