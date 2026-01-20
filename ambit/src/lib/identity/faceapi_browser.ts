const FACEAPI_SCRIPT_SRC =
  "https://cdn.jsdelivr.net/npm/face-api.js/dist/face-api.min.js";

export const DEFAULT_FACEAPI_MODEL_BASE_URL =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

let faceapi_promise: Promise<any> | null = null;
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

export const ensure_faceapi = async (): Promise<any> => {
  if (typeof window === "undefined") {
    throw new Error("face-api can only be loaded in the browser.");
  }

  if (faceapi_promise) return faceapi_promise;

  faceapi_promise = (async () => {
    if ((window as any).faceapi) return (window as any).faceapi;
    await load_script_once({ id: "faceapi-js", src: FACEAPI_SCRIPT_SRC });
    if (!(window as any).faceapi) {
      throw new Error("face-api.js loaded but window.faceapi is missing.");
    }
    return (window as any).faceapi;
  })();

  return faceapi_promise;
};

export const load_faceapi_models = async ({
  base_url,
}: {
  base_url?: string;
}) => {
  const faceapi = await ensure_faceapi();
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

