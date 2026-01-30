import { useEffect, useState } from "react";

const STORAGE_KEY = "ambit.voice_quality.v1";

export type VoiceQuality = "quality" | "fast";

export const useVoiceQuality = () => {
  const [quality, set_quality_state] = useState<VoiceQuality>(() => {
    if (typeof window === "undefined") return "quality";

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "fast" || stored === "quality") {
        return stored;
      }
    } catch {
      // ignore localStorage errors
    }

    return "quality";
  });

  // Keep localStorage in sync with any changes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, quality);
    } catch {
      // ignore localStorage errors
    }
  }, [quality]);

  const set_quality = (value: VoiceQuality) => {
    set_quality_state(value);
  };

  return { quality, set_quality };
};
