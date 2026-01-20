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

  video_el.srcObject = stream;
  await video_el.play();
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

