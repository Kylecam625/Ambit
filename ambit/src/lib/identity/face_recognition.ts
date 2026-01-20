import { ensure_faceapi } from "./faceapi_browser";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const to_float32 = (value: number[]): Float32Array | null => {
  if (!Array.isArray(value)) return null;
  if (value.length < 32) return null;
  return new Float32Array(value.map((n) => (Number.isFinite(n) ? n : 0)));
};

export type identity_match_profile = {
  profile_id: string;
  name: string;
  enrollments: Array<{ descriptor: number[] }>;
};

export const build_face_matcher = async ({
  profiles,
  distance_threshold,
}: {
  profiles: identity_match_profile[];
  distance_threshold: number;
}) => {
  const faceapi = await ensure_faceapi();
  const threshold = clamp(distance_threshold || 0.45, 0.3, 0.9);

  const labeled = profiles
    .map((profile) => {
      const descriptors = (profile.enrollments || [])
        .map((e) => to_float32(e.descriptor))
        .filter((d): d is Float32Array => Boolean(d));
      if (descriptors.length === 0) return null;
      return new faceapi.LabeledFaceDescriptors(profile.profile_id, descriptors);
    })
    .filter(Boolean);

  if (labeled.length === 0) {
    return null;
  }

  return new faceapi.FaceMatcher(labeled, threshold);
};

export const detect_single_face_descriptor = async ({
  video_el,
  input_size = 224,
  score_threshold = 0.5,
}: {
  video_el: HTMLVideoElement;
  input_size?: number;
  score_threshold?: number;
}) => {
  const faceapi = await ensure_faceapi();

  const result = await faceapi
    .detectSingleFace(
      video_el,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: clamp(input_size, 128, 512),
        scoreThreshold: clamp(score_threshold, 0.1, 0.95),
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;

  return {
    descriptor: result.descriptor as Float32Array,
    detection: result,
  };
};

export const match_face_descriptor = async ({
  face_matcher,
  descriptor,
}: {
  face_matcher: any;
  descriptor: Float32Array;
}) => {
  if (!face_matcher || typeof face_matcher.findBestMatch !== "function") {
    return { profile_id: null as string | null, distance: null as number | null };
  }

  const best = face_matcher.findBestMatch(descriptor);
  const label = typeof best?.label === "string" ? best.label : "unknown";
  const distance = typeof best?.distance === "number" ? best.distance : null;

  if (!label || label === "unknown") {
    return { profile_id: null, distance };
  }

  return { profile_id: label, distance };
};

export const draw_face_overlay = async ({
  canvas_el,
  video_el,
  detection,
  label,
  mirror = false,
}: {
  canvas_el: HTMLCanvasElement;
  video_el: HTMLVideoElement;
  detection: any;
  label: string;
  mirror?: boolean;
}) => {
  const vw = video_el.videoWidth || 0;
  const vh = video_el.videoHeight || 0;
  if (!vw || !vh) return;

  const rect = canvas_el.getBoundingClientRect();
  const cw = rect.width || canvas_el.clientWidth || vw;
  const ch = rect.height || canvas_el.clientHeight || vh;
  const dpr = window.devicePixelRatio || 1;
  canvas_el.width = Math.round(cw * dpr);
  canvas_el.height = Math.round(ch * dpr);

  const ctx = canvas_el.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const box = detection?.detection?.box || detection?.box;
  if (!box) return;

  const source_w = detection?.detection?.imageWidth || detection?.imageWidth || vw;
  const source_h = detection?.detection?.imageHeight || detection?.imageHeight || vh;
  const scale_to_video_x = source_w ? vw / source_w : 1;
  const scale_to_video_y = source_h ? vh / source_h : 1;
  const box_x = (typeof box.x === "number" ? box.x : 0) * scale_to_video_x;
  const box_y = (typeof box.y === "number" ? box.y : 0) * scale_to_video_y;
  const box_w = (typeof box.width === "number" ? box.width : 0) * scale_to_video_x;
  const box_h = (typeof box.height === "number" ? box.height : 0) * scale_to_video_y;

  const fit = window.getComputedStyle(video_el).objectFit || "cover";
  const scale =
    fit === "contain" || fit === "scale-down"
      ? Math.min(cw / vw, ch / vh)
      : Math.max(cw / vw, ch / vh);
  const render_w = vw * scale;
  const render_h = vh * scale;
  const offset_x = (cw - render_w) / 2;
  const offset_y = (ch - render_h) / 2;

  const base_x = box_x * scale;
  const y = box_y * scale + offset_y;
  const width = box_w * scale;
  const height = box_h * scale;
  const x = mirror
    ? offset_x + (render_w - (base_x + width))
    : offset_x + base_x;

  const text = typeof label === "string" ? label.trim() : "";
  const stroke_color = "#22c55e";

  ctx.strokeStyle = stroke_color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  if (text) {
    ctx.font = "14px sans-serif";
    ctx.textBaseline = "top";

    const padding_x = 6;
    const padding_y = 4;
    const text_width = ctx.measureText(text).width;
    const label_width = text_width + padding_x * 2;
    const label_height = 18;
    const label_x = Math.min(Math.max(0, x), Math.max(0, cw - label_width));
    const label_y = Math.max(0, y - label_height - 6);

    ctx.fillStyle = stroke_color;
    ctx.fillRect(label_x, label_y, label_width, label_height);
    ctx.fillStyle = "#0b0b0b";
    ctx.fillText(text, label_x + padding_x, label_y + padding_y);
  }
};

