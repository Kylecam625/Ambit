const IDENTITY_SERVICE_URL_STORAGE_KEY = "ambit.identity_service_url.v1";

const DEFAULT_IDENTITY_SERVICE_URL =
  process.env.NEXT_PUBLIC_IDENTITY_SERVICE_URL || "http://localhost:5176";

export const get_identity_service_url = (): string => {
  if (typeof window === "undefined") {
    return process.env.IDENTITY_SERVICE_URL || DEFAULT_IDENTITY_SERVICE_URL;
  }

  try {
    const raw = window.localStorage.getItem(IDENTITY_SERVICE_URL_STORAGE_KEY);
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed || DEFAULT_IDENTITY_SERVICE_URL;
  } catch {
    // localStorage may be unavailable in SSR or private browsing; use env default
    return DEFAULT_IDENTITY_SERVICE_URL;
  }
};

