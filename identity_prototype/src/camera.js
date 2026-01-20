import { clamp } from "./utils.js";

/**
 * @param {{
 *   video_el: HTMLVideoElement,
 *   facing_mode?: "user" | "environment",
 *   width?: number,
 *   height?: number,
 *   frame_rate?: number,
 * }} args
 */
export const start_camera = async ({
  video_el,
  facing_mode = "user",
  width = 1280,
  height = 720,
  frame_rate = 60,
}) => {
  if (!video_el) {
    throw new Error("video element is required");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not supported in this browser.");
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

/**
 * @param {{ video_el: HTMLVideoElement }} args
 */
export const stop_camera = ({ video_el }) => {
  const stream = video_el?.srcObject;
  if (stream && typeof stream === "object" && "getTracks" in stream) {
    // @ts-ignore
    stream.getTracks().forEach((track) => track.stop());
  }
  if (video_el) {
    video_el.srcObject = null;
  }
};

const draw_video_frame_to_canvas = ({
  video_el,
  canvas,
  max_size,
}) => {
  const vw = video_el.videoWidth || 0;
  const vh = video_el.videoHeight || 0;
  if (!vw || !vh) {
    return false;
  }

  const scale = max_size / Math.max(vw, vh);
  const w = clamp(Math.round(vw * scale), 1, max_size);
  const h = clamp(Math.round(vh * scale), 1, max_size);

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }

  // Mirror horizontally to match displayed video
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video_el, 0, 0, w, h);
  ctx.restore();

  return true;
};

/**
 * @param {{
 *   video_el: HTMLVideoElement,
 *   max_size?: number,
 *   mime?: "image/jpeg" | "image/png",
 *   quality?: number,
 * }} args
 */
export const capture_thumbnail_data_url = ({
  video_el,
  max_size = 240,
  mime = "image/jpeg",
  quality = 0.8,
}) => {
  const canvas = document.createElement("canvas");
  const ok = draw_video_frame_to_canvas({ video_el, canvas, max_size });
  if (!ok) return null;
  try {
    return canvas.toDataURL(mime, quality);
  } catch {
    return null;
  }
};

