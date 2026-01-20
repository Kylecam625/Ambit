import { useEffect, useState } from "react";

export const useIsFullscreen = (): boolean => {
  const [is_fullscreen, set_is_fullscreen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const update = () => set_is_fullscreen(Boolean(document.fullscreenElement));
    update();

    document.addEventListener("fullscreenchange", update);
    // Safari/iOS WebKit
    document.addEventListener("webkitfullscreenchange", update as EventListener);

    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update as EventListener);
    };
  }, []);

  return is_fullscreen;
};

