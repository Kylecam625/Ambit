import { useEffect, useState } from "react";

export const useWindowSize = (): { width: number; height: number } => {
  const [size, set_size] = useState<{ width: number; height: number }>(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      set_size({ width: window.innerWidth, height: window.innerHeight });
    };

    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true } as AddEventListenerOptions);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return size;
};

