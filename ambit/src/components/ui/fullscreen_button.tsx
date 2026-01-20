"use client";

import { toggle_fullscreen } from "@/lib/ui/fullscreen";

export const FullscreenButton = () => {
  return (
    <button
      className="rounded-full border border-zinc-700 bg-zinc-900 p-3 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
      onClick={() => void toggle_fullscreen()}
      type="button"
      title="Fullscreen"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M16 3h3a2 2 0 0 1 2 2v3" />
        <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    </button>
  );
};

