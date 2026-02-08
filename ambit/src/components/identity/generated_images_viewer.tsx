"use client";

import { useEffect, useState } from "react";
import type { identity_generated_image } from "@/lib/identity/identity_types";

type GeneratedImagesViewerProps = {
  profile_id: string;
  profile_name: string;
  on_close: () => void;
  on_view_generated_images: (
    profile_id: string
  ) => Promise<identity_generated_image[] | null>;
};

export const GeneratedImagesViewer = ({
  profile_id,
  profile_name,
  on_close,
  on_view_generated_images,
}: GeneratedImagesViewerProps) => {
  const [images, set_images] = useState<identity_generated_image[] | null>(
    null
  );
  const [is_loading, set_is_loading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      set_is_loading(true);
      try {
        const data = await on_view_generated_images(profile_id);
        if (!cancelled) set_images(data);
      } catch {
        if (!cancelled) set_images(null);
      } finally {
        if (!cancelled) set_is_loading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [on_view_generated_images, profile_id]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-lg" onClick={on_close} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
      <div
        className="glass-panel relative w-full max-w-5xl rounded-2xl p-5 sm:p-7 shadow-2xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Generated images for ${profile_name}`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Generated Images
            </p>
            <p className="text-base text-zinc-300">
              Saved images for <span className="font-semibold text-zinc-100">{profile_name}</span>
            </p>
          </div>
          <button
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:border-zinc-600 transition-colors"
            onClick={on_close}
            disabled={is_loading}
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
        </div>

        {is_loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-zinc-400">Loading images...</p>
          </div>
        ) : Array.isArray(images) ? (
          images.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <div
                  key={img.image_id}
                  className="group rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 transition-colors hover:border-zinc-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.image_data_url}
                    alt={img.prompt || "Generated image"}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  {img.prompt && (
                    <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-zinc-300">
                      {img.prompt}
                    </p>
                  )}
                  {img.created_at && (
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      {img.created_at}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
              <p className="text-sm text-zinc-400">
                No generated images saved yet.
              </p>
            </div>
          )
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <p className="text-sm text-red-300">Failed to load images.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
