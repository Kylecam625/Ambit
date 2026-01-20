export const request_fullscreen = async (): Promise<void> => {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) return;

  const el = document.documentElement as unknown as {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };

  if (typeof el.requestFullscreen === "function") await el.requestFullscreen();
  else if (typeof el.webkitRequestFullscreen === "function") await el.webkitRequestFullscreen();
};

export const exit_fullscreen = async (): Promise<void> => {
  if (typeof document === "undefined") return;
  if (!document.fullscreenElement) return;

  const doc = document as unknown as {
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
  };

  if (typeof doc.exitFullscreen === "function") await doc.exitFullscreen();
  else if (typeof doc.webkitExitFullscreen === "function") await doc.webkitExitFullscreen();
};

export const toggle_fullscreen = async (): Promise<void> => {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) await exit_fullscreen();
  else await request_fullscreen();
};

