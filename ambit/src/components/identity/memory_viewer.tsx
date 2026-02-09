"use client";

import { useCallback, useEffect, useState } from "react";
import type { identity_memory } from "@/lib/identity/identity_types";
import type { memory_cleanup_suggestion } from "@/lib/identity/memory_extractor";

type MemoryViewerProps = {
  profile_id: string;
  profile_name: string;
  is_busy: boolean;
  recognized_profile_id: string | null;
  recognized_label: string;
  on_close: () => void;
  on_view_memory: (profile_id: string) => Promise<identity_memory | null>;
  on_delete_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;
  on_clear_all_memory: (args: { profile_id: string }) => Promise<boolean>;
  on_analyze_memory: (args: { profile_id: string }) => Promise<memory_cleanup_suggestion | null>;
};

type cleanup_phase = "idle" | "analyzing" | "reviewing" | "applying";

export const MemoryViewer = ({
  profile_id,
  profile_name,
  is_busy,
  recognized_profile_id,
  recognized_label,
  on_close,
  on_view_memory,
  on_delete_memory_item,
  on_clear_all_memory,
  on_analyze_memory,
}: MemoryViewerProps) => {
  const [memory_data, set_memory_data] = useState<identity_memory | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [gate_error, set_gate_error] = useState<string | null>(null);
  const [is_confirming_clear, set_is_confirming_clear] = useState(false);
  const [is_clearing, set_is_clearing] = useState(false);

  // Smart cleanup state
  const [cleanup_phase, set_cleanup_phase] = useState<cleanup_phase>("idle");
  const [cleanup_suggestion, set_cleanup_suggestion] = useState<memory_cleanup_suggestion | null>(null);
  const [cleanup_selected, set_cleanup_selected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      set_is_loading(true);
      try {
        const memory = await on_view_memory(profile_id);
        if (!cancelled) set_memory_data(memory);
      } catch {
        if (!cancelled) set_memory_data(null);
      } finally {
        if (!cancelled) set_is_loading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [on_view_memory, profile_id]);

  const delete_value = useCallback(
    async (kind: "tag" | "fact" | "preference" | "note", value: string) => {
      if (is_busy || is_loading) return;

      const is_allowed = Boolean(
        recognized_profile_id && recognized_profile_id === profile_id
      );
      if (!is_allowed) {
        const recognized = recognized_profile_id
          ? recognized_label || recognized_profile_id
          : "None";
        set_gate_error(
          `Memory locked. Currently recognized: ${recognized}. To edit memory, the matching face must be recognized.`
        );
        return;
      }

      const updated = await on_delete_memory_item({
        profile_id,
        kind,
        value,
      });
      if (!updated) {
        set_gate_error("Failed to update memory.");
        return;
      }
      set_memory_data(updated);
    },
    [
      is_busy,
      is_loading,
      on_delete_memory_item,
      profile_id,
      recognized_label,
      recognized_profile_id,
    ]
  );

  const handle_clear_all = useCallback(async () => {
    if (is_busy || is_loading || is_clearing) return;

    const is_allowed = Boolean(
      recognized_profile_id && recognized_profile_id === profile_id
    );
    if (!is_allowed) {
      const recognized = recognized_profile_id
        ? recognized_label || recognized_profile_id
        : "None";
      set_gate_error(
        `Memory locked. Currently recognized: ${recognized}. To clear memory, the matching face must be recognized.`
      );
      set_is_confirming_clear(false);
      return;
    }

    set_is_clearing(true);
    set_gate_error(null);
    try {
      const ok = await on_clear_all_memory({ profile_id });
      if (ok) {
        set_memory_data({ tags: {}, facts: [], preferences: [], notes: [] });
      } else {
        set_gate_error("Failed to clear memory.");
      }
    } catch {
      set_gate_error("Failed to clear memory.");
    } finally {
      set_is_clearing(false);
      set_is_confirming_clear(false);
    }
  }, [
    is_busy,
    is_loading,
    is_clearing,
    on_clear_all_memory,
    profile_id,
    recognized_label,
    recognized_profile_id,
  ]);

  const handle_analyze = useCallback(async () => {
    if (is_busy || is_loading) return;

    const is_allowed = Boolean(
      recognized_profile_id && recognized_profile_id === profile_id
    );
    if (!is_allowed) {
      const recognized = recognized_profile_id
        ? recognized_label || recognized_profile_id
        : "None";
      set_gate_error(
        `Memory locked. Currently recognized: ${recognized}. To clean up memory, the matching face must be recognized.`
      );
      return;
    }

    set_cleanup_phase("analyzing");
    set_gate_error(null);
    try {
      const suggestion = await on_analyze_memory({ profile_id });
      if (!suggestion) {
        set_gate_error("Failed to analyze memory.");
        set_cleanup_phase("idle");
        return;
      }

      const total =
        suggestion.tags_to_remove.length +
        suggestion.facts_to_remove.length +
        suggestion.preferences_to_remove.length +
        suggestion.notes_to_remove.length;

      if (total === 0) {
        set_gate_error(null);
        set_cleanup_phase("idle");
        set_cleanup_suggestion(null);
        // Show a brief message
        set_gate_error("Memory looks clean — nothing to remove.");
        return;
      }

      // Build the initial selection set (all flagged items selected by default)
      const initial_selected = new Set<string>();
      for (const key of suggestion.tags_to_remove) initial_selected.add(`tag:${key}`);
      for (const f of suggestion.facts_to_remove) initial_selected.add(`fact:${f}`);
      for (const p of suggestion.preferences_to_remove) initial_selected.add(`pref:${p}`);
      for (const n of suggestion.notes_to_remove) initial_selected.add(`note:${n}`);

      set_cleanup_suggestion(suggestion);
      set_cleanup_selected(initial_selected);
      set_cleanup_phase("reviewing");
    } catch {
      set_gate_error("Failed to analyze memory.");
      set_cleanup_phase("idle");
    }
  }, [is_busy, is_loading, on_analyze_memory, profile_id, recognized_label, recognized_profile_id]);

  const toggle_cleanup_item = useCallback((key: string) => {
    set_cleanup_selected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handle_apply_cleanup = useCallback(async () => {
    if (!cleanup_suggestion) return;
    set_cleanup_phase("applying");
    set_gate_error(null);

    try {
      const tags_to_remove = cleanup_suggestion.tags_to_remove.filter((k) => cleanup_selected.has(`tag:${k}`));
      const facts_to_remove = cleanup_suggestion.facts_to_remove.filter((f) => cleanup_selected.has(`fact:${f}`));
      const prefs_to_remove = cleanup_suggestion.preferences_to_remove.filter((p) => cleanup_selected.has(`pref:${p}`));
      const notes_to_remove = cleanup_suggestion.notes_to_remove.filter((n) => cleanup_selected.has(`note:${n}`));

      // Delete each category via the existing patch mechanism
      let latest_memory: identity_memory | null = memory_data;

      if (tags_to_remove.length > 0) {
        for (const key of tags_to_remove) {
          const result = await on_delete_memory_item({ profile_id, kind: "tag", value: key });
          if (result) latest_memory = result;
        }
      }
      if (facts_to_remove.length > 0) {
        for (const fact of facts_to_remove) {
          const result = await on_delete_memory_item({ profile_id, kind: "fact", value: fact });
          if (result) latest_memory = result;
        }
      }
      if (prefs_to_remove.length > 0) {
        for (const pref of prefs_to_remove) {
          const result = await on_delete_memory_item({ profile_id, kind: "preference", value: pref });
          if (result) latest_memory = result;
        }
      }
      if (notes_to_remove.length > 0) {
        for (const note of notes_to_remove) {
          const result = await on_delete_memory_item({ profile_id, kind: "note", value: note });
          if (result) latest_memory = result;
        }
      }

      set_memory_data(latest_memory);
      set_cleanup_phase("idle");
      set_cleanup_suggestion(null);
      set_cleanup_selected(new Set());
    } catch {
      set_gate_error("Failed to apply cleanup.");
      set_cleanup_phase("reviewing");
    }
  }, [cleanup_selected, cleanup_suggestion, memory_data, on_delete_memory_item, profile_id]);

  const handle_cancel_cleanup = useCallback(() => {
    set_cleanup_phase("idle");
    set_cleanup_suggestion(null);
    set_cleanup_selected(new Set());
  }, []);

  const is_empty =
    memory_data &&
    (!memory_data.facts || memory_data.facts.length === 0) &&
    (!memory_data.preferences || memory_data.preferences.length === 0) &&
    (!memory_data.notes || memory_data.notes.length === 0) &&
    (!memory_data.tags || Object.keys(memory_data.tags).length === 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-lg" onClick={on_close} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
      <div
        className="glass-panel relative w-full max-w-4xl rounded-2xl p-5 sm:p-7 shadow-2xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Memory for ${profile_name}`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              OpenAI Memory
            </p>
            <p className="text-base text-zinc-300">
              Saved information for <span className="font-semibold text-zinc-100">{profile_name}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!is_empty && !is_loading && memory_data && cleanup_phase === "idle" && (
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-900/50 bg-amber-950/40 px-3 py-2.5 text-xs font-medium text-amber-300 hover:border-amber-700 hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                onClick={() => void handle_analyze()}
                disabled={is_busy || is_loading}
                type="button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
                Smart Cleanup
              </button>
            )}
            {!is_empty && !is_loading && memory_data && cleanup_phase === "idle" && (
              is_confirming_clear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-300">Erase all memory for {profile_name}?</span>
                  <button
                    className="inline-flex items-center rounded-xl border border-red-700 bg-red-900/60 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-800/80 transition-colors disabled:opacity-50"
                    onClick={() => void handle_clear_all()}
                    disabled={is_clearing}
                    type="button"
                  >
                    {is_clearing ? "Clearing..." : "Confirm"}
                  </button>
                  <button
                    className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600 transition-colors"
                    onClick={() => set_is_confirming_clear(false)}
                    disabled={is_clearing}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-900/50 bg-red-950/40 px-3 py-2.5 text-xs font-medium text-red-300 hover:border-red-700 hover:bg-red-900/40 transition-colors disabled:opacity-50"
                  onClick={() => set_is_confirming_clear(true)}
                  disabled={is_busy || is_loading}
                  type="button"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  Clear All
                </button>
              )
            )}
            <button
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:border-zinc-600 transition-colors"
              onClick={on_close}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
          </div>
        </div>

        {gate_error && (
          <p className="mb-3 text-xs text-red-300">{gate_error}</p>
        )}

        {cleanup_phase === "analyzing" ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              <p className="text-sm text-amber-300">Analyzing memory for noise...</p>
            </div>
          </div>
        ) : cleanup_phase === "reviewing" || cleanup_phase === "applying" ? (
          <div className="grid gap-4">
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
              <p className="text-sm text-amber-200">
                AI found <span className="font-semibold">{cleanup_selected.size}</span> item{cleanup_selected.size !== 1 ? "s" : ""} that look like noise.
                Uncheck any you want to <span className="font-semibold">keep</span>, then apply.
              </p>
            </div>

            {cleanup_suggestion && cleanup_suggestion.tags_to_remove.length > 0 && (
              <CleanupSection title="Tags flagged for removal">
                {cleanup_suggestion.tags_to_remove.map((key) => (
                  <CleanupRow
                    key={`tag:${key}`}
                    label={`${key}:`}
                    value={memory_data?.tags?.[key] || ""}
                    is_checked={cleanup_selected.has(`tag:${key}`)}
                    on_toggle={() => toggle_cleanup_item(`tag:${key}`)}
                    disabled={cleanup_phase === "applying"}
                  />
                ))}
              </CleanupSection>
            )}

            {cleanup_suggestion && cleanup_suggestion.facts_to_remove.length > 0 && (
              <CleanupSection title="Facts flagged for removal">
                {cleanup_suggestion.facts_to_remove.map((fact) => (
                  <CleanupRow
                    key={`fact:${fact}`}
                    value={fact}
                    is_checked={cleanup_selected.has(`fact:${fact}`)}
                    on_toggle={() => toggle_cleanup_item(`fact:${fact}`)}
                    disabled={cleanup_phase === "applying"}
                  />
                ))}
              </CleanupSection>
            )}

            {cleanup_suggestion && cleanup_suggestion.preferences_to_remove.length > 0 && (
              <CleanupSection title="Preferences flagged for removal">
                {cleanup_suggestion.preferences_to_remove.map((pref) => (
                  <CleanupRow
                    key={`pref:${pref}`}
                    value={pref}
                    is_checked={cleanup_selected.has(`pref:${pref}`)}
                    on_toggle={() => toggle_cleanup_item(`pref:${pref}`)}
                    disabled={cleanup_phase === "applying"}
                  />
                ))}
              </CleanupSection>
            )}

            {cleanup_suggestion && cleanup_suggestion.notes_to_remove.length > 0 && (
              <CleanupSection title="Notes flagged for removal">
                {cleanup_suggestion.notes_to_remove.map((note) => (
                  <CleanupRow
                    key={`note:${note}`}
                    value={note}
                    is_checked={cleanup_selected.has(`note:${note}`)}
                    on_toggle={() => toggle_cleanup_item(`note:${note}`)}
                    disabled={cleanup_phase === "applying"}
                  />
                ))}
              </CleanupSection>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-50"
                onClick={handle_cancel_cleanup}
                disabled={cleanup_phase === "applying"}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-700 bg-amber-900/60 px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-800/80 transition-colors disabled:opacity-50"
                onClick={() => void handle_apply_cleanup()}
                disabled={cleanup_phase === "applying" || cleanup_selected.size === 0}
                type="button"
              >
                {cleanup_phase === "applying" ? "Applying..." : `Remove ${cleanup_selected.size} item${cleanup_selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        ) : is_loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-zinc-400">Loading memory...</p>
          </div>
        ) : memory_data ? (
          <div className="grid gap-4">
            {/* Tags */}
            {memory_data.tags &&
              Object.keys(memory_data.tags).length > 0 && (
                <MemorySection title="Tags">
                  {Object.entries(memory_data.tags).map(([key, value]) => (
                    <MemoryRow
                      key={key}
                      label={`${key}:`}
                      value={value}
                      on_delete={() => void delete_value("tag", key)}
                      disabled={is_busy || is_loading}
                    />
                  ))}
                </MemorySection>
              )}

            {/* Facts */}
            {memory_data.facts && memory_data.facts.length > 0 && (
              <MemorySection title="Facts">
                {memory_data.facts.map((fact, idx) => (
                  <MemoryRow
                    key={idx}
                    value={fact}
                    on_delete={() => void delete_value("fact", fact)}
                    disabled={is_busy || is_loading}
                  />
                ))}
              </MemorySection>
            )}

            {/* Preferences */}
            {memory_data.preferences &&
              memory_data.preferences.length > 0 && (
                <MemorySection title="Preferences">
                  {memory_data.preferences.map((pref, idx) => (
                    <MemoryRow
                      key={idx}
                      value={pref}
                      on_delete={() => void delete_value("preference", pref)}
                      disabled={is_busy || is_loading}
                    />
                  ))}
                </MemorySection>
              )}

            {/* Notes */}
            {memory_data.notes && memory_data.notes.length > 0 && (
              <MemorySection title="Notes">
                {memory_data.notes.map((note, idx) => (
                  <MemoryRow
                    key={idx}
                    value={note}
                    on_delete={() => void delete_value("note", note)}
                    disabled={is_busy || is_loading}
                  />
                ))}
              </MemorySection>
            )}

            {/* Empty state */}
            {is_empty && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center">
                <p className="text-sm text-zinc-400">
                  No memory data saved yet.
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Memory will be extracted from conversations automatically.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center">
            <p className="text-sm text-red-300">Failed to load memory data.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

/* ---------- Internal sub-components ---------- */

const MemorySection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
      {title}
    </p>
    <div className="grid gap-2.5">{children}</div>
  </div>
);

const MemoryRow = ({
  label,
  value,
  on_delete,
  disabled,
}: {
  label?: string;
  value: string;
  on_delete: () => void;
  disabled: boolean;
}) => (
  <div className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5">
    <div className="flex min-w-0 items-start gap-2 text-sm">
      {label ? (
        <span className="shrink-0 font-medium text-zinc-400">{label}</span>
      ) : (
        <span className="mt-0.5 shrink-0 text-zinc-500">&bull;</span>
      )}
      <span className="text-zinc-200 break-words">{value}</span>
    </div>
    <button
      className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-50 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
      onClick={on_delete}
      disabled={disabled}
      type="button"
    >
      Delete
    </button>
  </div>
);

/* ---------- Cleanup review sub-components ---------- */

const CleanupSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
      {title}
    </p>
    <div className="grid gap-2">{children}</div>
  </div>
);

const CleanupRow = ({
  label,
  value,
  is_checked,
  on_toggle,
  disabled,
}: {
  label?: string;
  value: string;
  is_checked: boolean;
  on_toggle: () => void;
  disabled: boolean;
}) => (
  <label
    className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
      is_checked ? "bg-red-950/30" : "bg-white/[0.03]"
    }`}
  >
    <input
      type="checkbox"
      checked={is_checked}
      onChange={on_toggle}
      disabled={disabled}
      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-600 bg-zinc-900 text-amber-500 accent-amber-500"
    />
    <div className="flex min-w-0 items-start gap-2 text-sm">
      {label ? (
        <span className="shrink-0 font-medium text-zinc-400">{label}</span>
      ) : (
        <span className="mt-0.5 shrink-0 text-zinc-500">&bull;</span>
      )}
      <span className={`break-words ${is_checked ? "text-red-300 line-through" : "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  </label>
);
