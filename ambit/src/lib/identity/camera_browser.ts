const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const start_camera = async ({
  video_el,
  facing_mode = "user",
  width = 1280,
  height = 720,
  frame_rate = 60,
}: {
  video_el: HTMLVideoElement;
  facing_mode?: "user" | "environment";
  width?: number;
  height?: number;
  frame_rate?: number;
}) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not supported.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: facing_mode,
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frame_rate, max: frame_rate },
    },
    audio: false,
  });

  // Make camera startup more robust across browsers.
  // Even if `play()` is blocked temporarily, the stream can still be used for frame capture.
  video_el.autoplay = true;
  video_el.muted = true;
  video_el.playsInline = true;
  video_el.srcObject = stream;
  try {
    await video_el.play();
  } catch (error) {
    console.warn("[camera] video.play() failed; stream is still active.", error);
  }
  return stream;
};

export const stop_camera = ({ video_el }: { video_el: HTMLVideoElement }) => {
  const stream = video_el.srcObject;
  if (stream && typeof stream === "object" && "getTracks" in stream) {
    (stream as MediaStream).getTracks().forEach((track) => track.stop());
  }
  video_el.srcObject = null;
};

export const capture_thumbnail_data_url = ({
  video_el,
  max_size = 240,
  mime = "image/jpeg",
  quality = 0.8,
}: {
  video_el: HTMLVideoElement;
  max_size?: number;
  mime?: "image/jpeg" | "image/png";
  quality?: number;
}) => {
  const vw = video_el.videoWidth || 0;
  const vh = video_el.videoHeight || 0;
  if (!vw || !vh) return null;

  const scale = max_size / Math.max(vw, vh);
  const w = clamp(Math.round(vw * scale), 1, max_size);
  const h = clamp(Math.round(vh * scale), 1, max_size);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Mirror horizontally to match the displayed video
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video_el, 0, 0, w, h);
  ctx.restore();

  try {
    return canvas.toDataURL(mime, quality);
  } catch {
    return null;
  }
};

export const capture_frame_data_url = ({
  video_el,
  max_size = 512,
  mime = "image/jpeg",
  quality = 0.8,
  mirror = true,
}: {
  video_el: HTMLVideoElement;
  max_size?: number;
  mime?: "image/jpeg" | "image/png";
  quality?: number;
  mirror?: boolean;
}) => {
  const vw = video_el.videoWidth || 0;
  const vh = video_el.videoHeight || 0;
  if (!vw || !vh) return null;

  const scale = max_size / Math.max(vw, vh);
  const w = clamp(Math.round(vw * scale), 1, max_size);
  const h = clamp(Math.round(vh * scale), 1, max_size);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (mirror) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video_el, 0, 0, w, h);

  if (mirror) {
    ctx.restore();
  }

  try {
    return canvas.toDataURL(mime, quality);
  } catch {
    return null;
  }
};

const is_media_stream = (value: unknown): value is MediaStream =>
  typeof value === "object" &&
  value !== null &&
  "getVideoTracks" in value &&
  typeof (value as MediaStream).getVideoTracks === "function";

const blob_to_data_url = async (blob: Blob): Promise<string | null> => {
  try {
    const reader = new FileReader();
    const result = await new Promise<string | null>((resolve, reject) => {
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(blob);
    });
    return result;
  } catch {
    return null;
  }
};

export const capture_frame_data_url_async = async ({
  video_el,
  max_size = 512,
  mime = "image/jpeg",
  quality = 0.8,
  mirror = true,
}: {
  video_el: HTMLVideoElement;
  max_size?: number;
  mime?: "image/jpeg" | "image/png";
  quality?: number;
  mirror?: boolean;
}): Promise<string | null> => {
  // Fast path: canvas draw from <video> when dimensions are ready.
  const immediate = capture_frame_data_url({ video_el, max_size, mime, quality, mirror });
  if (immediate) return immediate;

  // Fallback: ImageCapture can grab frames even if the <video> element isn't "playing" yet.
  if (typeof window === "undefined") return null;

  const src = video_el.srcObject;
  if (!is_media_stream(src)) return null;
  const track = src.getVideoTracks()[0];
  if (!track) return null;

  type image_capture_like = {
    grabFrame?: () => Promise<ImageBitmap>;
    takePhoto?: () => Promise<Blob>;
  };
  type image_capture_constructor = new (track: MediaStreamTrack) => image_capture_like;

  const ImageCaptureCtor = (window as unknown as { ImageCapture?: image_capture_constructor }).ImageCapture;
  if (typeof ImageCaptureCtor !== "function") return null;

  try {
    const capture = new ImageCaptureCtor(track);

    // Prefer grabFrame() (ImageBitmap) when available.
    if (typeof capture?.grabFrame === "function") {
      const bitmap: ImageBitmap = await capture.grabFrame();
      try {
        const vw = (bitmap as unknown as { width?: number }).width ?? 0;
        const vh = (bitmap as unknown as { height?: number }).height ?? 0;
        if (!vw || !vh) return null;

        const scale = max_size / Math.max(vw, vh);
        const w = clamp(Math.round(vw * scale), 1, max_size);
        const h = clamp(Math.round(vh * scale), 1, max_size);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        if (mirror) {
          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }

        ctx.drawImage(bitmap, 0, 0, w, h);

        if (mirror) {
          ctx.restore();
        }

        return canvas.toDataURL(mime, quality);
      } finally {
        try {
          // Some browsers support ImageBitmap.close()
          (bitmap as unknown as { close?: () => void }).close?.();
        } catch {
          // ignore
        }
      }
    }

    // Fallback to takePhoto() (Blob) if exposed.
    if (typeof capture?.takePhoto === "function") {
      const blob: Blob = await capture.takePhoto();
      const data_url = await blob_to_data_url(blob);
      if (!data_url) return null;
      return data_url;
    }
  } catch {
    return null;
  }

  return null;
};

