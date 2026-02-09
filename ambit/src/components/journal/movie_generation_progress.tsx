"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type progress_data = {
  task_id: string;
  status: string;
  progress_step: string | null;
  progress_message: string;
  images_generated: number;
  images_total: number;
  movie_id: string | null;
  error: string | null;
};

const STEPS = [
  { key: "splitting_text", label: "Preparing narration" },
  { key: "generating_images", label: "Generating images" },
  { key: "generating_audio", label: "Creating narration" },
  { key: "saving", label: "Saving movie" },
  { key: "complete", label: "Done" },
] as const;

const step_index = (step: string | null): number => {
  if (!step) return -1;
  return STEPS.findIndex((s) => s.key === step);
};

type MovieGenerationProgressProps = {
  task_id: string;
  on_complete: (movie_id: string) => void;
  on_error: (error: string) => void;
  on_cancel: () => void;
};

export const MovieGenerationProgress = ({
  task_id,
  on_complete,
  on_error,
  on_cancel,
}: MovieGenerationProgressProps) => {
  const [progress, set_progress] = useState<progress_data | null>(null);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const completed_ref = useRef(false);

  const poll = useCallback(async () => {
    if (completed_ref.current) return;
    try {
      const response = await fetch(`/api/journal/movie/status/${encodeURIComponent(task_id)}`);
      if (!response.ok) return;
      const data = (await response.json()) as progress_data;
      set_progress(data);

      if (data.status === "succeeded" && data.movie_id) {
        completed_ref.current = true;
        if (poll_ref.current) clearInterval(poll_ref.current);
        on_complete(data.movie_id);
      } else if (data.status === "failed") {
        completed_ref.current = true;
        if (poll_ref.current) clearInterval(poll_ref.current);
        on_error(data.error || "Movie generation failed");
      }
    } catch {
      // polling error — keep retrying
    }
  }, [task_id, on_complete, on_error]);

  useEffect(() => {
    poll();
    poll_ref.current = setInterval(poll, 2000);
    return () => {
      if (poll_ref.current) clearInterval(poll_ref.current);
    };
  }, [poll]);

  const current_step = progress?.progress_step ?? null;
  const current_idx = step_index(current_step);
  const is_failed = progress?.status === "failed";

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm">
        {/* Film icon */}
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400 animate-pulse">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
              <line x1="17" y1="17" x2="22" y2="17" />
            </svg>
          </div>
        </div>

        <h3 className="text-center text-base font-semibold text-zinc-200 mb-1">
          {is_failed ? "Generation Failed" : "Generating Your Movie"}
        </h3>
        <p className="text-center text-xs text-zinc-500 mb-6">
          {is_failed ? (progress?.error || "An error occurred") : (progress?.progress_message || "Starting...")}
        </p>

        {/* Steps */}
        <div className="space-y-3 mb-6">
          {STEPS.filter((s) => s.key !== "complete").map((step, idx) => {
            const is_done = current_idx > idx;
            const is_active = current_idx === idx && !is_failed;
            const is_pending = current_idx < idx;

            return (
              <div key={step.key} className="flex items-center gap-3">
                {/* Status indicator */}
                <div className={`
                  flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all
                  ${is_done ? "bg-emerald-500/20 text-emerald-400" : ""}
                  ${is_active ? "bg-amber-500/20 text-amber-400" : ""}
                  ${is_pending ? "bg-white/5 text-zinc-600" : ""}
                  ${is_failed && is_active ? "bg-red-500/20 text-red-400" : ""}
                `}>
                  {is_done ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M13.485 3.929a1 1 0 0 1 .086 1.325l-.086.096-6.5 6a1 1 0 0 1-1.262.086l-.096-.086-3-3a1 1 0 0 1 1.262-1.506l.096.086L6.32 9.265l5.844-5.336a1 1 0 0 1 1.321 0z" />
                    </svg>
                  ) : is_active && !is_failed ? (
                    <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : is_failed && is_active ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-current opacity-40" />
                  )}
                </div>

                {/* Label */}
                <span className={`text-sm ${is_done || is_active ? "text-zinc-300" : "text-zinc-600"}`}>
                  {step.label}
                  {step.key === "generating_images" && is_active && progress && (
                    <span className="text-amber-400/70 ml-1">({progress.images_generated}/{progress.images_total})</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Cancel / retry */}
        {is_failed ? (
          <button
            type="button"
            onClick={on_cancel}
            className="w-full rounded-lg bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10 transition-colors cursor-pointer"
          >
            Close
          </button>
        ) : (
          <p className="text-center text-xs text-zinc-600">
            This may take a minute or two...
          </p>
        )}
      </div>
    </div>
  );
};
