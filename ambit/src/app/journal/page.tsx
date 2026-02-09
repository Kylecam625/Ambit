"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { JournalCalendar } from "@/components/journal/journal_calendar";
import { JournalEditor } from "@/components/journal/journal_editor";
import { JournalVoiceQA } from "@/components/journal/journal_voice_qa";
import { VoicePickerModal } from "@/components/journal/voice_picker_modal";
import { MovieGenerationProgress } from "@/components/journal/movie_generation_progress";
import { JournalMoviePlayer } from "@/components/journal/journal_movie_player";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import {
  identity_list_journal_entries,
  identity_get_journal_entry,
  identity_create_journal_entry,
  identity_update_journal_entry,
  identity_get_latest_journal_movie,
  identity_list_journal_movies,
  identity_list_movie_dates,
  identity_get_journal_movie,
} from "@/lib/identity/identity_service_client";
import type {
  identity_journal_entry,
  identity_journal_entry_summary,
  journal_movie,
  journal_movie_summary,
} from "@/lib/identity/identity_types";
import type { qa_message } from "@/hooks/use_journal_qa";
import { MatrixRain } from "@/components/ui/matrix_rain";

type page_state = "idle" | "qa_session" | "editing";
type movie_state = "idle" | "picking_voice" | "generating" | "playing";

const format_today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function JournalPage() {
  const search_params = useSearchParams();
  const profile_id = search_params.get("profile_id");
  const profile_name = search_params.get("name") || "friend";

  // Calendar state
  const today = useMemo(() => format_today(), []);
  const [year, set_year] = useState(() => new Date().getFullYear());
  const [month, set_month] = useState(() => new Date().getMonth() + 1);
  const [selected_date, set_selected_date] = useState<string | null>(today);
  const [entries, set_entries] = useState<identity_journal_entry_summary[]>([]);

  // Page state
  const [page_state, set_page_state] = useState<page_state>("idle");
  const [current_entry, set_current_entry] = useState<identity_journal_entry | null>(null);
  const [editor_html, set_editor_html] = useState("");
  const [qa_transcript, set_qa_transcript] = useState<qa_message[]>([]);

  // Save state
  const [is_saving, set_is_saving] = useState(false);
  const [save_status, set_save_status] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Loading
  const [is_loading_entries, set_is_loading_entries] = useState(false);
  const [is_loading_entry, set_is_loading_entry] = useState(false);

  // Movie state
  const [movie_state, set_movie_state] = useState<movie_state>("idle");
  const [movie_task_id, set_movie_task_id] = useState<string | null>(null);
  const [current_movie, set_current_movie] = useState<journal_movie | null>(null);
  const [movie_versions, set_movie_versions] = useState<journal_movie_summary[]>([]);
  const [movie_dates, set_movie_dates] = useState<Set<string>>(new Set());

  const base_url = useMemo(() => get_identity_service_url(), []);

  // ── Load calendar entries when month changes ──
  const load_entries = useCallback(async () => {
    if (!profile_id) return;
    set_is_loading_entries(true);
    try {
      const data = await identity_list_journal_entries({ base_url, profile_id, year, month });
      set_entries(data);
    } catch (err) {
      console.warn("[Journal] Failed to load entries:", err);
    } finally {
      set_is_loading_entries(false);
    }
  }, [base_url, profile_id, year, month]);

  // ── Load movie dates for calendar indicators ──
  const load_movie_dates = useCallback(async () => {
    if (!profile_id) return;
    try {
      const dates = await identity_list_movie_dates({ base_url, profile_id, year, month });
      set_movie_dates(new Set(dates));
    } catch {
      // non-critical
    }
  }, [base_url, profile_id, year, month]);

  useEffect(() => {
    load_entries();
    load_movie_dates();
  }, [load_entries, load_movie_dates]);

  // ── Load full entry when a date is selected ──
  const load_entry = useCallback(
    async (date: string) => {
      if (!profile_id) return;
      set_is_loading_entry(true);
      try {
        const entry = await identity_get_journal_entry({ base_url, profile_id, entry_date: date });
        if (entry) {
          set_current_entry(entry);
          set_editor_html(entry.content_html);
          set_page_state("editing");
          set_save_status("saved");
        } else {
          set_current_entry(null);
          set_editor_html("");
          set_page_state("idle");
        }
      } catch {
        set_current_entry(null);
        set_editor_html("");
        set_page_state("idle");
      } finally {
        set_is_loading_entry(false);
      }
    },
    [base_url, profile_id]
  );

  // ── Load movie versions for a date ──
  const load_movie_for_date = useCallback(
    async (date: string) => {
      if (!profile_id) return;
      try {
        const versions = await identity_list_journal_movies({ base_url, profile_id, entry_date: date });
        set_movie_versions(versions.filter((v) => v.status === "complete"));
      } catch {
        set_movie_versions([]);
      }
    },
    [base_url, profile_id]
  );

  // ── Handle date selection ──
  const handle_select_date = useCallback(
    (date: string) => {
      set_selected_date(date);
      set_page_state("idle");
      set_movie_state("idle");
      set_current_entry(null);
      set_current_movie(null);
      set_movie_versions([]);
      set_editor_html("");
      set_qa_transcript([]);
      load_entry(date);
      load_movie_for_date(date);
    },
    [load_entry, load_movie_for_date]
  );

  // ── Start Q&A session ──
  const start_qa = useCallback(() => {
    set_page_state("qa_session");
    set_qa_transcript([]);
  }, []);

  // ── When journal is generated from Q&A ──
  const handle_journal_generated = useCallback(
    (html: string, transcript: qa_message[]) => {
      set_editor_html(html);
      set_qa_transcript(transcript);
      set_page_state("editing");
      set_save_status("idle");
    },
    []
  );

  // ── Save journal entry ──
  const handle_save = useCallback(
    async (html: string, text: string) => {
      if (!profile_id || !selected_date) return;

      set_is_saving(true);
      set_save_status("saving");

      try {
        if (current_entry) {
          // Update existing
          const updated = await identity_update_journal_entry({
            base_url,
            profile_id,
            entry_date: selected_date,
            content_html: html,
            content_text: text,
          });
          set_current_entry(updated);
        } else {
          // Create new
          const created = await identity_create_journal_entry({
            base_url,
            profile_id,
            entry_date: selected_date,
            content_html: html,
            content_text: text,
            qa_transcript: qa_transcript.length > 0 ? qa_transcript : null,
            mood: null,
          });
          set_current_entry(created);
        }
        set_save_status("saved");
        // Refresh calendar entries
        load_entries();
      } catch (err) {
        console.error("[Journal] Save failed:", err);
        set_save_status("error");
      } finally {
        set_is_saving(false);
      }
    },
    [profile_id, selected_date, current_entry, base_url, qa_transcript, load_entries]
  );

  // ── Movie generation flow ──
  const handle_open_voice_picker = useCallback(() => {
    set_movie_state("picking_voice");
  }, []);

  const handle_voice_selected = useCallback(
    async (selection: { voice_id: string; voice_name: string }) => {
      if (!profile_id || !selected_date) return;

      set_movie_state("generating");

      try {
        const response = await fetch("/api/journal/movie/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id,
            entry_date: selected_date,
            voice_id: selection.voice_id,
            voice_name: selection.voice_name,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error((data as { error?: string })?.error || "Failed to start generation");
        }

        const data = (await response.json()) as { task_id: string };
        set_movie_task_id(data.task_id);
      } catch (err) {
        console.error("[Journal] Movie generation failed to start:", err);
        set_movie_state("idle");
      }
    },
    [profile_id, selected_date]
  );

  const handle_movie_generation_complete = useCallback(
    async (movie_id: string) => {
      if (!profile_id) return;
      try {
        const movie = await identity_get_journal_movie({ base_url, profile_id, movie_id });
        if (movie) {
          set_current_movie(movie);
          set_movie_state("playing");
          // Refresh movie dates and versions
          load_movie_dates();
          if (selected_date) load_movie_for_date(selected_date);
        }
      } catch {
        set_movie_state("idle");
      }
    },
    [base_url, profile_id, selected_date, load_movie_dates, load_movie_for_date]
  );

  const handle_movie_generation_error = useCallback((error: string) => {
    console.error("[Journal] Movie generation failed:", error);
    // Keep showing the progress component which displays the error
  }, []);

  const handle_play_movie = useCallback(
    async (movie_id?: string) => {
      if (!profile_id || !selected_date) return;
      try {
        let movie: journal_movie | null = null;
        if (movie_id) {
          movie = await identity_get_journal_movie({ base_url, profile_id, movie_id });
        } else {
          movie = await identity_get_latest_journal_movie({ base_url, profile_id, entry_date: selected_date });
        }
        if (movie) {
          set_current_movie(movie);
          set_movie_state("playing");
        }
      } catch (err) {
        console.warn("[Journal] Failed to load movie:", err);
      }
    },
    [base_url, profile_id, selected_date]
  );

  const handle_close_movie = useCallback(() => {
    set_movie_state("idle");
    set_current_movie(null);
  }, []);

  const handle_regenerate_movie = useCallback(() => {
    set_movie_state("picking_voice");
    set_current_movie(null);
  }, []);

  const handle_change_month = useCallback((y: number, m: number) => {
    set_year(y);
    set_month(m);
  }, []);

  // ── Face-gated: no profile ──
  if (!profile_id) {
    return (
      <div className="relative h-screen w-screen overflow-hidden text-zinc-100">
        <div className="ambient-bg ambient-idle" />
        <MatrixRain opacity={0.06} mood="neutral" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-4">
          <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center max-w-md">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-2">Journal Locked</h2>
            <p className="text-sm text-zinc-400 mb-6">
              Your journal is private and secured by face recognition. Please go back and let Ambit recognize you first.
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-amber-500/20 px-5 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors"
            >
              Back to Ambit
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Determine what to show in the main content area ──
  const has_entry_for_selected = entries.some((e) => e.entry_date === selected_date);
  const is_today = selected_date === today;

  const selected_date_label = selected_date
    ? new Date(selected_date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <div className="relative min-h-screen w-screen overflow-hidden text-zinc-100">
      {/* Background */}
      <div className="ambient-bg ambient-idle" />
      <MatrixRain opacity={0.06} mood="neutral" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-screen">
        {/* Top nav */}
        <header className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/5">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" /></svg>
            Back to Ambit
          </Link>
          <h1 className="text-sm font-semibold text-zinc-300 tracking-wide">
            {profile_name}&apos;s Journal
          </h1>
          <div className="w-24" />
        </header>

        {/* Main content: calendar + editor */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto min-h-0">
          {/* Sidebar: Calendar */}
          <aside className="shrink-0 lg:w-72">
            <JournalCalendar
              entries={entries}
              selected_date={selected_date}
              on_select_date={handle_select_date}
              year={year}
              month={month}
              on_change_month={handle_change_month}
              movie_dates={movie_dates}
            />
          </aside>

          {/* Main content area */}
          <main className="flex-1 min-w-0">
            {is_loading_entry && (
              <div className="flex items-center justify-center h-64">
                <div className="h-8 w-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
              </div>
            )}

            {!is_loading_entry && page_state === "idle" && selected_date && (
              <div className="flex flex-col items-center justify-center gap-5 py-16 px-4">
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-zinc-200 mb-1">{selected_date_label}</h2>
                  <p className="text-sm text-zinc-500">
                    {has_entry_for_selected
                      ? "Loading your journal entry..."
                      : is_today
                        ? "No journal entry yet for today."
                        : `No journal entry for this day.`
                    }
                  </p>
                </div>

                {!has_entry_for_selected && (
                  <button
                    type="button"
                    onClick={start_qa}
                    className="flex items-center gap-3 rounded-xl bg-amber-500/15 border border-amber-500/20 px-6 py-4 hover:bg-amber-500/25 transition-all group cursor-pointer"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 group-hover:bg-amber-500/30 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="block text-sm font-semibold text-amber-200">Start Journaling with Ambit</span>
                      <span className="block text-xs text-zinc-500">Ambit will ask you about your day</span>
                    </div>
                  </button>
                )}
              </div>
            )}

            {!is_loading_entry && page_state === "qa_session" && selected_date && (
              <JournalVoiceQA
                profile_name={profile_name}
                entry_date={selected_date}
                on_journal_generated={handle_journal_generated}
                on_cancel={() => set_page_state("idle")}
              />
            )}

            {!is_loading_entry && page_state === "editing" && movie_state === "idle" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-300">{selected_date_label}</h2>
                  <div className="flex items-center gap-3">
                    {movie_versions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handle_play_movie()}
                        className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Play Movie
                        {movie_versions.length > 1 && (
                          <span className="text-zinc-500">({movie_versions.length} versions)</span>
                        )}
                      </button>
                    )}
                    {current_entry && (
                      <button
                        type="button"
                        onClick={start_qa}
                        className="text-xs text-zinc-500 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        Re-do Q&A
                      </button>
                    )}
                  </div>
                </div>
                <JournalEditor
                  initial_html={editor_html}
                  on_save={handle_save}
                  is_saving={is_saving}
                  save_status={save_status}
                  on_generate_movie={handle_open_voice_picker}
                  has_entry={Boolean(current_entry)}
                />
              </div>
            )}

            {/* Movie generation progress */}
            {movie_state === "generating" && movie_task_id && (
              <MovieGenerationProgress
                task_id={movie_task_id}
                on_complete={handle_movie_generation_complete}
                on_error={handle_movie_generation_error}
                on_cancel={() => { set_movie_state("idle"); set_movie_task_id(null); }}
              />
            )}

            {/* Movie player */}
            {movie_state === "playing" && current_movie && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-300">{selected_date_label}</h2>
                  {movie_versions.length > 1 && (
                    <select
                      value={current_movie.movie_id}
                      onChange={(e) => handle_play_movie(e.target.value)}
                      className="h-7 rounded-md bg-white/5 px-2 text-xs text-zinc-400 outline-none border border-white/10 cursor-pointer"
                    >
                      {movie_versions.map((v) => (
                        <option key={v.movie_id} value={v.movie_id} className="bg-zinc-900">
                          Version {v.version} — {new Date(v.created_at).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <JournalMoviePlayer
                  movie={current_movie}
                  on_close={handle_close_movie}
                  on_regenerate={handle_regenerate_movie}
                />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Voice picker modal */}
      {movie_state === "picking_voice" && (
        <VoicePickerModal
          on_select={handle_voice_selected}
          on_close={() => set_movie_state("idle")}
        />
      )}
    </div>
  );
}
