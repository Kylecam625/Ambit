const FACEAPI_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/npm/face-api.js/dist/face-api.min.js";

export const DEFAULT_FACEAPI_MODEL_BASE_URL =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

type faceapi_model_loader = { loadFromUri: (url: string) => Promise<void> };
type faceapi_nets = {
  tinyFaceDetector: faceapi_model_loader;
  faceLandmark68Net: faceapi_model_loader;
  faceRecognitionNet: faceapi_model_loader;
};
type faceapi_with_nets = { nets: faceapi_nets };

const is_record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const is_faceapi_with_nets = (value: unknown): value is faceapi_with_nets => {
  if (!is_record(value)) return false;
  const nets = value["nets"];
  if (!is_record(nets)) return false;

  const tiny = nets["tinyFaceDetector"];
  const lm = nets["faceLandmark68Net"];
  const rec = nets["faceRecognitionNet"];

  const is_loader = (v: unknown): v is faceapi_model_loader =>
    is_record(v) && typeof v["loadFromUri"] === "function";

  return is_loader(tiny) && is_loader(lm) && is_loader(rec);
};

let faceapi_promise: Promise<unknown> | null = null;
let models_loaded_base_url: string | null = null;
let models_load_promise: Promise<void> | null = null;

const load_script_once = async ({
  id,
  src,
}: {
  id: string;
  src: string;
}) => {
  const existing = document.getElementById(id);
  if (existing) return;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

export const ensure_faceapi = async (): Promise<unknown> => {
  if (typeof window === "undefined") {
    throw new Error("face-api can only be loaded in the browser.");
  }

  if (faceapi_promise) return faceapi_promise;

  faceapi_promise = (async () => {
    const existing = (window as unknown as { faceapi?: unknown }).faceapi;
    if (existing) return existing;
    await load_script_once({ id: "faceapi-js", src: FACEAPI_SCRIPT_SRC });
    const loaded = (window as unknown as { faceapi?: unknown }).faceapi;
    if (!loaded) {
      throw new Error("face-api.js loaded but window.faceapi is missing.");
    }
    return loaded;
  })();

  return faceapi_promise;
};

export const load_faceapi_models = async ({
  base_url,
}: {
  base_url?: string;
}) => {
  const raw_faceapi = await ensure_faceapi();
  if (!is_faceapi_with_nets(raw_faceapi)) {
    throw new Error("face-api.js loaded but expected nets loaders are missing.");
  }
  const faceapi = raw_faceapi;
  const normalized =
    typeof base_url === "string" && base_url.trim()
      ? base_url.trim().replace(/\/+$/, "")
      : DEFAULT_FACEAPI_MODEL_BASE_URL;

  if (models_loaded_base_url === normalized && models_load_promise) {
    return models_load_promise;
  }

  models_loaded_base_url = normalized;
  models_load_promise = (async () => {
    await faceapi.nets.tinyFaceDetector.loadFromUri(normalized);
    await faceapi.nets.faceLandmark68Net.loadFromUri(normalized);
    await faceapi.nets.faceRecognitionNet.loadFromUri(normalized);
  })();

  return models_load_promise;
};

