const FACEAPI_SCRIPT_SRC = "/api/faceapi_js";

export const DEFAULT_FACEAPI_MODEL_BASE_URL =
  "/api/faceapi_weights";

const FALLBACK_FACEAPI_MODEL_BASE_URLS: string[] = [
  // Preferred: jsDelivr GitHub CDN (often works when raw.githubusercontent.com is blocked)
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights",
  // Fallback: GitHub raw (original default)
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

type faceapi_model_loader = { loadFromUri: (url: string) => Promise<void> };
type faceapi_nets = {
  tinyFaceDetector: faceapi_model_loader;
  faceLandmark68Net: faceapi_model_loader;
  faceRecognitionNet: faceapi_model_loader;
  faceExpressionNet: faceapi_model_loader;
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
  const expr = nets["faceExpressionNet"];

  const is_loader = (v: unknown): v is faceapi_model_loader =>
    is_record(v) && typeof v["loadFromUri"] === "function";

  return is_loader(tiny) && is_loader(lm) && is_loader(rec) && is_loader(expr);
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
  if (existing) {
    const loaded = existing.getAttribute("data-loaded");
    if (loaded === "1") return;
    // Previous load failed or never completed; remove and retry.
    existing.remove();
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.setAttribute("data-loaded", "0");
    script.onload = () => {
      script.setAttribute("data-loaded", "1");
      resolve();
    };
    script.onerror = () => {
      // Allow retries.
      script.remove();
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });
};

export const ensure_faceapi = async (): Promise<unknown> => {
  if (typeof window === "undefined") {
    throw new Error("face-api can only be loaded in the browser.");
  }

  if (faceapi_promise) return faceapi_promise;

  faceapi_promise = (async () => {
    try {
      const existing = (window as unknown as { faceapi?: unknown }).faceapi;
      if (existing) return existing;
      await load_script_once({ id: "faceapi-js", src: FACEAPI_SCRIPT_SRC });
      const loaded = (window as unknown as { faceapi?: unknown }).faceapi;
      if (!loaded) {
        throw new Error("face-api.js loaded but window.faceapi is missing.");
      }
      return loaded;
    } catch (error) {
      // If the CDN is blocked / flaky, allow future retries.
      faceapi_promise = null;
      throw error;
    }
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

  const normalize_base_url = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\/+$/, "");
  };

  const preferred = normalize_base_url(base_url);
  const candidates = [
    preferred,
    ...FALLBACK_FACEAPI_MODEL_BASE_URLS.map(normalize_base_url),
    normalize_base_url(DEFAULT_FACEAPI_MODEL_BASE_URL),
  ]
    .filter((v): v is string => Boolean(v))
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  // Models are already loaded (or currently loading). No need to re-load from a different base URL.
  if (models_load_promise) return models_load_promise;

  models_load_promise = (async () => {
    let last_error: unknown = null;
    for (const candidate of candidates) {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(candidate);
        await faceapi.nets.faceLandmark68Net.loadFromUri(candidate);
        await faceapi.nets.faceRecognitionNet.loadFromUri(candidate);
        await faceapi.nets.faceExpressionNet.loadFromUri(candidate);
        models_loaded_base_url = candidate;
        return;
      } catch (error) {
        last_error = error;
      }
    }

    // IMPORTANT: If a model download fails once (network hiccup / blocked CDN),
    // we must clear the cached promise so future calls can retry.
    models_loaded_base_url = null;
    models_load_promise = null;

    throw last_error instanceof Error ? last_error : new Error("Failed to load face models.");
  })();

  return models_load_promise;
};

