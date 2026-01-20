import { clamp } from "./utils.js";
import { wait_for_faceapi } from "./models.js";

const to_float32 = (value) => {
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value)) return new Float32Array(value.map((n) => Number(n) || 0));
  return null;
};

/**
 * @param {{
 *   profiles: Array<{
 *     profile_id: string;
 *     name: string;
 *     enrollments: Array<{ descriptor: number[] }>;
 *   }>;
 *   distance_threshold: number;
 * }} args
 */
export const build_face_matcher = async ({
  profiles,
  distance_threshold,
}) => {
  const faceapi = await wait_for_faceapi();

  const threshold = clamp(Number(distance_threshold) || 0.45, 0.3, 0.9);
  const labeled = [];

  for (const profile of profiles || []) {
    const id = typeof profile?.profile_id === "string" ? profile.profile_id : "";
    if (!id) continue;

    const descriptors = (profile.enrollments || [])
      .map((e) => to_float32(e?.descriptor))
      .filter((d) => d instanceof Float32Array);

    if (descriptors.length === 0) continue;
    labeled.push(new faceapi.LabeledFaceDescriptors(id, descriptors));
  }

  return {
    face_matcher: new faceapi.FaceMatcher(labeled, threshold),
    threshold,
  };
};

/**
 * @param {{
 *   video_el: HTMLVideoElement;
 *   input_size?: number;
 *   score_threshold?: number;
 * }} args
 */
export const detect_single_face = async ({
  video_el,
  input_size = 224,
  score_threshold = 0.5,
}) => {
  const faceapi = await wait_for_faceapi();

  try {
    // Detect ALL faces with landmarks and descriptors using SSD MobileNet V1
    const allDetections = await faceapi
      .detectAllFaces(
        video_el,
        new faceapi.SsdMobilenetv1Options({
          minConfidence: clamp(score_threshold, 0.1, 0.95),
        })
      )
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (allDetections.length === 0) {
      return null;
    }

    // Sort by AREA (largest first) - the user's face is usually the largest
    const sortedBySize = [...allDetections].sort((a, b) => {
      const areaA = a.detection.box.width * a.detection.box.height;
      const areaB = b.detection.box.width * b.detection.box.height;
      return areaB - areaA;
    });

    // Return the largest face
    return sortedBySize[0];
  } catch (error) {
    // Silent fail for performance - errors logged only in console
    return null;
  }
};

/**
 * @param {{
 *   face_matcher: any;
 *   descriptor: Float32Array;
 * }} args
 */
export const match_face = async ({
  face_matcher,
  descriptor,
}) => {
  const faceapi = await wait_for_faceapi();
  if (!face_matcher || typeof face_matcher.findBestMatch !== "function") {
    return { label: "unknown", distance: null };
  }

  const best = face_matcher.findBestMatch(descriptor);
  const label = typeof best?.label === "string" ? best.label : "unknown";
  const distance = typeof best?.distance === "number" ? best.distance : null;

  return { label, distance, raw: best };
};

/**
 * @param {{
 *   canvas_el: HTMLCanvasElement;
 *   video_el: HTMLVideoElement;
 *   detection: any;
 *   label: string;
 *   mirror?: boolean;
 * }} args
 */
export const draw_overlay = async ({
  canvas_el,
  video_el,
  detection,
  label,
  mirror = false,
}) => {
  if (!canvas_el || !video_el) return;
  
  const faceapi = await wait_for_faceapi();
  
  const vw = video_el.videoWidth || 0;
  const vh = video_el.videoHeight || 0;
  if (!vw || !vh) return;

  const displaySize = { width: video_el.clientWidth, height: video_el.clientHeight };
  faceapi.matchDimensions(canvas_el, displaySize);

  const ctx = canvas_el.getContext("2d");
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas_el.width, canvas_el.height);

  const det = detection?.detection || detection;
  if (!det || !det.box) return;

  // Manual scaling from video coordinates to display coordinates
  const scaleX = displaySize.width / vw;
  const scaleY = displaySize.height / vh;
  
  const scaledBox = {
    x: det.box.x * scaleX,
    y: det.box.y * scaleY,
    width: det.box.width * scaleX,
    height: det.box.height * scaleY,
  };

  // Mirror on X-axis (video is CSS-mirrored)
  const mirroredBox = {
    x: displaySize.width - scaledBox.x - scaledBox.width,
    y: scaledBox.y,
    width: scaledBox.width,
    height: scaledBox.height,
  };

  // Use face-api.js DrawBox utility for consistent rendering
  const drawBox = new faceapi.draw.DrawBox(mirroredBox, {
    label: label || undefined,
    boxColor: "#22c55e",
    lineWidth: 2,
  });
  
  drawBox.draw(canvas_el);
};

