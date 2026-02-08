"use client";

import type { identity_profile_summary } from "@/lib/identity/identity_types";

type ProfileListProps = {
  profiles: identity_profile_summary[];
  is_busy: boolean;
  is_loading_memory: boolean;
  is_loading_images: boolean;
  recognized_profile_id: string | null;
  on_edit: (profile: identity_profile_summary) => void;
  on_delete: (args: { profile_id: string; name: string }) => void;
  on_view_memory: (profile_id: string, name: string) => void;
  on_view_images: (profile_id: string, name: string) => void;
};

export const ProfileList = ({
  profiles,
  is_busy,
  is_loading_memory,
  is_loading_images,
  recognized_profile_id,
  on_edit,
  on_delete,
  on_view_memory,
  on_view_images,
}: ProfileListProps) => {
  if (profiles.length === 0) {
    return <p className="mt-3 text-sm text-zinc-400">No profiles yet.</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {profiles.map((p) => {
        const meta = [
          typeof p.age === "number" ? `Age ${p.age}` : null,
          p.descriptor_count
            ? `${p.descriptor_count} enrollment(s)`
            : "0 enrollments",
        ]
          .filter(Boolean)
          .join(" \u2022 ");

        const is_recognized =
          recognized_profile_id === p.profile_id;

        return (
          <div
            key={p.profile_id}
            className={`rounded-xl border bg-black/60 px-4 py-3 transition-colors ${
              is_recognized
                ? "border-emerald-700/40 bg-emerald-950/10"
                : "border-white/[0.06]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-100">{p.name}</p>
                  {is_recognized && (
                    <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400">{meta}</p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <button
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 disabled:opacity-50 hover:border-zinc-600 transition-colors"
                  onClick={() => on_view_memory(p.profile_id, p.name)}
                  disabled={is_busy || is_loading_memory}
                  title={
                    is_recognized
                      ? "View memory"
                      : "Locked: face must match to view memory"
                  }
                  type="button"
                >
                  Memory
                </button>
                <button
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 disabled:opacity-50 hover:border-zinc-600 transition-colors"
                  onClick={() => on_view_images(p.profile_id, p.name)}
                  disabled={is_busy || is_loading_images}
                  title={
                    is_recognized
                      ? "View generated images"
                      : "Locked: face must match to view images"
                  }
                  type="button"
                >
                  Images
                </button>
                <button
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 disabled:opacity-50 hover:border-zinc-600 transition-colors"
                  onClick={() => on_edit(p)}
                  disabled={is_busy}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-300 disabled:opacity-50 hover:border-red-800/50 transition-colors"
                  onClick={() =>
                    on_delete({ profile_id: p.profile_id, name: p.name })
                  }
                  disabled={is_busy}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
