import { sleep, to_string_or_empty } from "./utils.js";

const DEFAULT_MODEL_BASE_URL =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

let is_loaded = false;
let loaded_base_url = null;

export const get_default_model_base_url = () => DEFAULT_MODEL_BASE_URL;

export const get_models_state = () => ({
  is_loaded,
  loaded_base_url,
});

export const wait_for_faceapi = async ({ timeout_ms = 15_000 } = {}) => {
  const started = Date.now();
  while (Date.now() - started < timeout_ms) {
    if (typeof window !== "undefined" && window.faceapi) return window.faceapi;
    await sleep(25);
  }
  throw new Error("face-api.js did not load (missing window.faceapi).");
};

export const load_models = async ({ base_url }) => {
  const faceapi = await wait_for_faceapi();
  const url = to_string_or_empty(base_url).trim() || DEFAULT_MODEL_BASE_URL;

  // Avoid re-loading if already loaded from same location
  if (is_loaded && loaded_base_url === url) {
    return { base_url: url };
  }

  is_loaded = false;
  loaded_base_url = null;

  // SSD Mobilenet v1 for more stable face boxes
  await faceapi.nets.ssdMobilenetv1.loadFromUri(url);
  await faceapi.nets.faceLandmark68Net.loadFromUri(url);
  await faceapi.nets.faceRecognitionNet.loadFromUri(url);

  is_loaded = true;
  loaded_base_url = url;
  return { base_url: url };
};

