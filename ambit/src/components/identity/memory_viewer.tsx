"use client";

import { useCallback, useEffect, useState } from "react";
import type { identity_memory } from "@/lib/identity/identity_types";

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
};

export const MemoryViewer = ({
  profile_id,
  profile_name,
  is_busy,
  recognized_profile_id,
  recognized_label,
  on_close,
  on_view_memory,
  on_delete_memory_item,
}: MemoryViewerProps) => {
  const [memory_data, set_memory_data] = useState<identity_memory | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [gate_error, set_gate_error] = useState<string | null>(null);

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
          <button
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:border-zinc-600 transition-colors"
            onClick={on_close}
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
        </div>

        {gate_error && (
          <p className="mb-3 text-xs text-red-300">{gate_error}</p>
        )}

        {is_loading ? (
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
