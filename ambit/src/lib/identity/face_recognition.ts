import { ensure_faceapi } from "./faceapi_browser";

type record_value = Record<string, unknown>;
const is_record = (value: unknown): value is record_value => typeof value === "object" && value !== null;
const to_number_or_null = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

type face_matcher_like = { findBestMatch: (descriptor: Float32Array) => unknown };

type faceapi_runtime = {
  // Detection
  TinyFaceDetectorOptions: new (args: { inputSize: number; scoreThreshold: number }) => unknown;
  detectSingleFace: (
    input: HTMLVideoElement,
    options: unknown
  ) => { withFaceLandmarks: () => { withFaceDescriptor: () => Promise<unknown> } };

  // Recognition / matching
  LabeledFaceDescriptors: new (label: string, descriptors: Float32Array[]) => unknown;
  FaceMatcher: new (labeled: unknown[], threshold: number) => face_matcher_like;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const FACE_DESCRIPTOR_LENGTH = 128;

const to_float32 = (value: unknown): Float32Array | null => {
  if (!Array.isArray(value)) return null;
  if (value.length !== FACE_DESCRIPTOR_LENGTH) return null;

  const out = new Float32Array(FACE_DESCRIPTOR_LENGTH);
  for (let i = 0; i < FACE_DESCRIPTOR_LENGTH; i += 1) {
    const n = Number(value[i]);
    if (!Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
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
  const faceapi = (await ensure_faceapi()) as faceapi_runtime;
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
  const faceapi = (await ensure_faceapi()) as faceapi_runtime;

  const raw_result = await faceapi
    .detectSingleFace(
      video_el,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: clamp(input_size, 128, 512),
        scoreThreshold: clamp(score_threshold, 0.1, 0.95),
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!raw_result) return null;
  if (!is_record(raw_result)) return null;
  const descriptor = raw_result["descriptor"];
  if (!(descriptor instanceof Float32Array)) return null;

  return {
    descriptor,
    detection: raw_result,
  };
};

export const match_face_descriptor = async ({
  face_matcher,
  descriptor,
}: {
  face_matcher: unknown;
  descriptor: Float32Array;
}) => {
  const has_find_best_match =
    is_record(face_matcher) && typeof face_matcher["findBestMatch"] === "function";
  if (!has_find_best_match) {
    return { profile_id: null as string | null, distance: null as number | null };
  }

  const best = (face_matcher as face_matcher_like).findBestMatch(descriptor);
  const best_record = is_record(best) ? best : null;
  const label = typeof best_record?.label === "string" ? best_record.label : "unknown";
  const distance = typeof best_record?.distance === "number" ? best_record.distance : null;

  if (!label || label === "unknown") {
    return { profile_id: null, distance };
  }

  return { profile_id: label, distance };
};

type detection_box = { x: number; y: number; width: number; height: number };
const to_box = (value: unknown): detection_box | null => {
  if (!is_record(value)) return null;
  const x = to_number_or_null(value["x"]);
  const y = to_number_or_null(value["y"]);
  const width = to_number_or_null(value["width"]);
  const height = to_number_or_null(value["height"]);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
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
  detection: unknown;
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

  const outer = is_record(detection) ? detection : null;
  const inner = outer && is_record(outer["detection"]) ? (outer["detection"] as record_value) : null;
  const box = to_box((inner ? inner["box"] : null) ?? (outer ? outer["box"] : null));
  if (!box) return;

  const source_w =
    to_number_or_null(inner ? inner["imageWidth"] : null) ??
    to_number_or_null(outer ? outer["imageWidth"] : null) ??
    vw;
  const source_h =
    to_number_or_null(inner ? inner["imageHeight"] : null) ??
    to_number_or_null(outer ? outer["imageHeight"] : null) ??
    vh;
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

