"use client";

import { useCallback, useMemo, useState } from "react";
import type { identity_profile_summary, identity_memory } from "@/lib/identity/identity_types";

const ENROLLMENT_CAPTURES_REQUIRED = 3;

const CAPTURE_INSTRUCTIONS: string[] = [
  "Look straight at the camera",
  "Turn your head slightly LEFT",
  "Turn your head slightly RIGHT",
];

export const ProfileManager = ({
  profiles,
  is_camera_running,
  is_models_loaded,
  is_busy,
  error_message,
  on_refresh,
  on_delete_profile,
  on_create_profile,
  on_capture_enrollment,
  on_view_memory,
}: {
  profiles: identity_profile_summary[];
  is_camera_running: boolean;
  is_models_loaded: boolean;
  is_busy: boolean;
  error_message: string | null;
  on_refresh: () => void;
  on_delete_profile: (args: { profile_id: string; name: string }) => void;
  on_create_profile: (args: {
    name: string;
    age: number | null;
    interests: string;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
  }) => void;
  on_capture_enrollment: () => Promise<{ descriptor: number[]; thumbnail: string | null } | null>;
  on_view_memory: (profile_id: string) => Promise<identity_memory | null>;
}) => {
  const [is_modal_open, set_is_modal_open] = useState(false);
  const [name, set_name] = useState("");
  const [age, set_age] = useState("");
  const [interests, set_interests] = useState("");
  const [enrollment_descriptors, set_enrollment_descriptors] = useState<number[][]>([]);
  const [enrollment_thumbnails, set_enrollment_thumbnails] = useState<Array<string | null>>([]);
  const [is_capturing, set_is_capturing] = useState(false);

  const [is_memory_modal_open, set_is_memory_modal_open] = useState(false);
  const [memory_data, set_memory_data] = useState<identity_memory | null>(null);
  const [memory_profile_name, set_memory_profile_name] = useState("");
  const [is_loading_memory, set_is_loading_memory] = useState(false);

  const can_open_modal = Boolean(is_camera_running && is_models_loaded && !is_busy);

  const open_modal = useCallback(() => {
    set_name("");
    set_age("");
    set_interests("");
    set_enrollment_descriptors([]);
    set_enrollment_thumbnails([]);
    set_is_modal_open(true);
  }, []);

  const close_modal = useCallback(() => {
    if (is_busy || is_capturing) return;
    set_is_modal_open(false);
  }, [is_busy, is_capturing]);

  const instruction = useMemo(() => {
    const i = Math.min(enrollment_descriptors.length, 2);
    return CAPTURE_INSTRUCTIONS[i];
  }, [enrollment_descriptors.length]);

  const capture = useCallback(async () => {
    if (is_capturing || is_busy) return;
    if (enrollment_descriptors.length >= ENROLLMENT_CAPTURES_REQUIRED) return;
    set_is_capturing(true);
    try {
      const result = await on_capture_enrollment();
      if (!result) return;
      set_enrollment_descriptors((current) => [...current, result.descriptor]);
      set_enrollment_thumbnails((current) => [...current, result.thumbnail]);
    } finally {
      set_is_capturing(false);
    }
  }, [enrollment_descriptors.length, is_busy, is_capturing, on_capture_enrollment]);

  const submit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (enrollment_descriptors.length < ENROLLMENT_CAPTURES_REQUIRED) return;
    const parsed_age = Number.parseInt(age.trim(), 10);
    const age_or_null = Number.isFinite(parsed_age) ? parsed_age : null;
    on_create_profile({
      name: trimmed,
      age: age_or_null,
      interests: interests.trim(),
      enrollment_descriptors,
      enrollment_thumbnails,
    });
    set_is_modal_open(false);
  }, [age, enrollment_descriptors, enrollment_thumbnails, interests, name, on_create_profile]);

  const view_memory = useCallback(async (profile_id: string, profile_name: string) => {
    if (is_loading_memory) return;
    set_is_loading_memory(true);
    set_memory_profile_name(profile_name);
    set_is_memory_modal_open(true);
    try {
      const memory = await on_view_memory(profile_id);
      set_memory_data(memory);
    } catch (error) {
      set_memory_data(null);
    } finally {
      set_is_loading_memory(false);
    }
  }, [is_loading_memory, on_view_memory]);

  const close_memory_modal = useCallback(() => {
    set_is_memory_modal_open(false);
    set_memory_data(null);
    set_memory_profile_name("");
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Profiles</p>
          <p className="text-xs text-zinc-400">{profiles.length} total</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
            onClick={on_refresh}
            disabled={is_busy}
          >
            Refresh
          </button>
          <button
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
            onClick={open_modal}
            disabled={!can_open_modal}
          >
            New profile
          </button>
        </div>
      </div>

      {error_message ? <p className="mt-2 text-xs text-red-300">{error_message}</p> : null}

      {profiles.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No profiles yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {profiles.map((p) => {
            const meta = [
              typeof p.age === "number" ? String(p.age) : null,
              p.descriptor_count ? `${p.descriptor_count} enrollment(s)` : "0 enrollments",
            ]
              .filter(Boolean)
              .join(" • ");

            return (
              <div
                key={p.profile_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm text-zinc-200">{p.name}</p>
                  <p className="text-xs text-zinc-400">{meta}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
                    onClick={() => void view_memory(p.profile_id, p.name)}
                    disabled={is_busy || is_loading_memory}
                  >
                    View Memory
                  </button>
                  <button
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
                    onClick={() => on_delete_profile({ profile_id: p.profile_id, name: p.name })}
                    disabled={is_busy}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {is_modal_open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={close_modal} />
          <div
            className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Create profile
                </p>
                <p className="text-sm text-zinc-300">
                  Capture {ENROLLMENT_CAPTURES_REQUIRED} enrollments, then create the profile.
                </p>
              </div>

              <button
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                onClick={close_modal}
                disabled={is_busy || is_capturing}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-400">Name</span>
                <input
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  value={name}
                  onChange={(e) => set_name(e.target.value)}
                  placeholder="Kyle"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">Age (optional)</span>
                  <input
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    value={age}
                    onChange={(e) => set_age(e.target.value)}
                    placeholder="27"
                    inputMode="numeric"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">Interests (optional)</span>
                  <input
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    value={interests}
                    onChange={(e) => set_interests(e.target.value)}
                    placeholder="music, startups, space"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-200">
                    Enrollment {enrollment_descriptors.length}/{ENROLLMENT_CAPTURES_REQUIRED}
                  </p>
                  <p className="text-xs text-zinc-400">{instruction}</p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {Array.from({ length: ENROLLMENT_CAPTURES_REQUIRED }).map((_, i) => {
                    const src = enrollment_thumbnails[i] ?? null;
                    return (
                      <div
                        key={i}
                        className="flex h-20 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt={`Enrollment ${i + 1}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-zinc-400">{i + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => void capture()}
                    disabled={
                      is_busy ||
                      is_capturing ||
                      enrollment_descriptors.length >= ENROLLMENT_CAPTURES_REQUIRED
                    }
                  >
                    {enrollment_descriptors.length >= ENROLLMENT_CAPTURES_REQUIRED
                      ? "Captures complete"
                      : is_capturing
                        ? "Capturing..."
                        : "Capture"}
                  </button>

                  <button
                    className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 disabled:opacity-50"
                    onClick={submit}
                    disabled={
                      is_busy ||
                      !name.trim() ||
                      enrollment_descriptors.length < ENROLLMENT_CAPTURES_REQUIRED
                    }
                  >
                    Create profile
                  </button>
                </div>
              </div>

              {error_message ? <p className="text-xs text-red-300">{error_message}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {is_memory_modal_open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={close_memory_modal} />
          <div
            className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  OpenAI Memory
                </p>
                <p className="text-sm text-zinc-300">
                  Saved information for {memory_profile_name}
                </p>
              </div>

              <button
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                onClick={close_memory_modal}
              >
                Close
              </button>
            </div>

            {is_loading_memory ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-zinc-400">Loading memory...</p>
              </div>
            ) : memory_data ? (
              <div className="grid gap-4">
                {/* Tags */}
                {memory_data.tags && Object.keys(memory_data.tags).length > 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 mb-2">
                      Tags
                    </p>
                    <div className="grid gap-2">
                      {Object.entries(memory_data.tags).map(([key, value]) => (
                        <div key={key} className="flex items-start gap-2 text-sm">
                          <span className="text-zinc-400 font-medium">{key}:</span>
                          <span className="text-zinc-200">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Facts */}
                {memory_data.facts && memory_data.facts.length > 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 mb-2">
                      Facts
                    </p>
                    <ul className="grid gap-2">
                      {memory_data.facts.map((fact, idx) => (
                        <li key={idx} className="text-sm text-zinc-200 flex items-start gap-2">
                          <span className="text-zinc-500 mt-1">•</span>
                          <span>{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Preferences */}
                {memory_data.preferences && memory_data.preferences.length > 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 mb-2">
                      Preferences
                    </p>
                    <ul className="grid gap-2">
                      {memory_data.preferences.map((pref, idx) => (
                        <li key={idx} className="text-sm text-zinc-200 flex items-start gap-2">
                          <span className="text-zinc-500 mt-1">•</span>
                          <span>{pref}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Notes */}
                {memory_data.notes && memory_data.notes.length > 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 mb-2">
                      Notes
                    </p>
                    <ul className="grid gap-2">
                      {memory_data.notes.map((note, idx) => (
                        <li key={idx} className="text-sm text-zinc-200 flex items-start gap-2">
                          <span className="text-zinc-500 mt-1">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Empty state */}
                {(!memory_data.facts || memory_data.facts.length === 0) &&
                (!memory_data.preferences || memory_data.preferences.length === 0) &&
                (!memory_data.notes || memory_data.notes.length === 0) &&
                (!memory_data.tags || Object.keys(memory_data.tags).length === 0) ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center">
                    <p className="text-sm text-zinc-400">No memory data saved yet.</p>
                    <p className="text-xs text-zinc-500 mt-2">
                      Memory will be extracted from conversations automatically.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center">
                <p className="text-sm text-red-300">Failed to load memory data.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

