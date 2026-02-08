"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  identity_profile_summary,
  identity_memory,
  identity_generated_image,
} from "@/lib/identity/identity_types";
import {
  identity_add_enrollment,
  identity_create_profile,
  identity_delete_profile,
  identity_get_profile,
  identity_patch_profile,
  identity_patch_memory,
  identity_list_generated_images,
  identity_list_profiles,
} from "@/lib/identity/identity_service_client";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import {
  DEFAULT_FACEAPI_MODEL_BASE_URL,
  load_faceapi_models,
} from "@/lib/identity/faceapi_browser";
import {
  build_face_matcher,
  detect_single_face_descriptor,
  match_face_descriptor,
  type identity_match_profile,
  type face_expression,
} from "@/lib/identity/face_recognition";
import {
  capture_thumbnail_data_url,
  start_camera,
  stop_camera,
} from "@/lib/identity/camera_browser";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MATCH_THRESHOLD = 0.6;
const CONFIRM_MS = 3000;
const RECOGNITION_GRACE_MS = 2000;
const CANDIDATE_GRACE_MS = 1500;
const NO_FACE_TIMEOUT_MS = 30_000;
const DETECTION_INTERVAL_MS = 30;
const CAMERA_BUSY_RETRY_INTERVAL_MS = 5000;

const is_camera_busy_error = (message: string | null): boolean => {
  const m = (message || "").toLowerCase();
  return (
    m.includes("device in use") ||
    m.includes("notreadableerror") ||
    m.includes("could not start video source") ||
    m.includes("trackstart") ||
    m.includes("starting video")
  );
};

export type identity_runtime = {
  service_url: string;
  is_connected: boolean;
  connection_error: string | null;

  profiles: identity_profile_summary[];
  recognized_profile_id: string | null;
  is_detected: boolean;
  detected_emotion: face_expression | null;

  is_models_loaded: boolean;
  models_error: string | null;
  is_camera_running: boolean;

  is_profile_action_running: boolean;
  profile_action_error: string | null;

  video_ref: RefObject<HTMLVideoElement | null>;

  refresh_profiles: () => Promise<void>;
  capture_profile_enrollment: () => Promise<{ descriptor: number[]; thumbnail: string | null } | null>;
  add_profile_enrollment: (args: { profile_id: string }) => Promise<void>;
  create_profile: (args: {
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
  }) => Promise<void>;
  update_profile: (args: {
    profile_id: string;
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
  }) => Promise<void>;
  delete_profile: (args: { profile_id: string; name: string }) => Promise<void>;
  view_profile_memory: (profile_id: string) => Promise<identity_memory | null>;
  view_profile_generated_images: (profile_id: string) => Promise<identity_generated_image[] | null>;
  delete_profile_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;
};

export const useIdentityRuntime = ({
  active_profile_id,
  on_change_active_profile_id,
  on_identity_expired,
  video_ref: provided_video_ref = null,
}: {
  active_profile_id: string | null;
  on_change_active_profile_id: (next: string | null) => void;
  on_identity_expired: () => void;
  video_ref?: RefObject<HTMLVideoElement | null> | null;
}): identity_runtime => {
  const internal_video_ref = useRef<HTMLVideoElement | null>(null);
  const video_ref = provided_video_ref ?? internal_video_ref;
  const stream_ref = useRef<MediaStream | null>(null);
  const has_started_camera_once_ref = useRef(false);
  const last_camera_restart_at_ref = useRef(0);
  const is_starting_camera_ref = useRef(false);
  const is_loading_models_ref = useRef(false);
  const last_models_retry_at_ref = useRef(0);

  const [service_url] = useState<string>(() => get_identity_service_url());
  const [is_connected, set_is_connected] = useState(false);
  const [connection_error, set_connection_error] = useState<string | null>(null);

  const [profiles, set_profiles] = useState<identity_profile_summary[]>([]);
  const [face_matcher, set_face_matcher] = useState<unknown>(null);

  const [is_camera_running, set_is_camera_running] = useState(false);
  const [is_models_loaded, set_is_models_loaded] = useState(false);
  const [models_error, set_models_error] = useState<string | null>(null);

  const [is_detected, set_is_detected] = useState(false);
  const [recognized_profile_id, set_recognized_profile_id] = useState<string | null>(null);
  const [detected_emotion, set_detected_emotion] = useState<face_expression | null>(null);

  const [is_profile_action_running, set_is_profile_action_running] = useState(false);
  const [profile_action_error, set_profile_action_error] = useState<string | null>(null);

  // Refs for the detection loop – these persist across effect restarts so that
  // confirmation state, grace periods, and expiration tracking aren't lost when
  // dependencies like active_profile_id or face_matcher change.
  const face_matcher_ref = useRef<unknown>(null);
  const active_profile_id_ref = useRef(active_profile_id);
  const on_change_active_profile_id_ref = useRef(on_change_active_profile_id);
  const on_identity_expired_ref = useRef(on_identity_expired);
  const last_confirmed_profile_id_ref = useRef<string | null>(null);
  const last_confirmed_at_ref = useRef(0);
  const last_face_seen_at_ref = useRef(0);
  const expired_profile_id_ref = useRef<string | null>(null);

  // Keep callback/value refs in sync on every render.
  face_matcher_ref.current = face_matcher;
  active_profile_id_ref.current = active_profile_id;
  on_change_active_profile_id_ref.current = on_change_active_profile_id;
  on_identity_expired_ref.current = on_identity_expired;

  const refresh_profiles = useCallback(async () => {
    const base_url = service_url.trim();
    try {
      const list = await identity_list_profiles({ base_url });
      set_profiles(list);

      const bundles = await Promise.all(
        list.map(async (p) => {
          try {
            return await identity_get_profile({ base_url, profile_id: p.profile_id });
          } catch (error) {
            console.warn(`[Identity] Failed to fetch profile ${p.profile_id}:`, error);
            return null;
          }
        })
      );

      const next_match_profiles: identity_match_profile[] = bundles
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .map((b) => ({
          profile_id: b.profile.profile_id,
          name: b.profile.name,
          enrollments: b.enrollments.map((e) => ({ descriptor: e.descriptor })),
        }));

      const matcher = await build_face_matcher({
        profiles: next_match_profiles,
        distance_threshold: MATCH_THRESHOLD,
      });
      set_face_matcher(matcher);

      set_is_connected(true);
      set_connection_error(null);
    } catch (error) {
      set_is_connected(false);
      set_connection_error(error instanceof Error ? error.message : "Failed to load profiles");
      set_profiles([]);
      set_face_matcher(null);
    }
  }, [service_url]);

  const load_models = useCallback(async (): Promise<void> => {
    if (is_loading_models_ref.current) return;
    is_loading_models_ref.current = true;

    set_models_error(null);
    set_is_models_loaded(false);

    try {
      const model_base_url =
        process.env.NEXT_PUBLIC_FACEAPI_MODEL_BASE_URL || DEFAULT_FACEAPI_MODEL_BASE_URL;
      await load_faceapi_models({ base_url: model_base_url });
      set_is_models_loaded(true);
      set_models_error(null);
    } catch (error) {
      // Keep the camera running even if models fail; identity matching will remain disabled.
      set_models_error(error instanceof Error ? error.message : "Failed to load face models");
      set_is_models_loaded(false);
      throw error;
    } finally {
      is_loading_models_ref.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    const video_el = video_ref.current;
    if (!video_el) return;

    if (is_starting_camera_ref.current) return;
    is_starting_camera_ref.current = true;

    // Start the camera first so camera-dependent tools (like vision) can work even if
    // face-api model downloads are blocked by the network.
    try {
      set_models_error(null);
      const stream = await start_camera({ video_el });
      stream_ref.current = stream;
      set_is_camera_running(true);
      has_started_camera_once_ref.current = true;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Failed to start camera";
      const message = raw || "Failed to start camera";
      set_models_error(
        is_camera_busy_error(message)
          ? "Camera busy (device in use). Close other apps/tabs using the webcam."
          : message
      );
      return;
    } finally {
      is_starting_camera_ref.current = false;
    }
    try {
      await load_models();
    } catch {
      // handled in load_models()
    }

    void refresh_profiles();
  }, [load_models, refresh_profiles, video_ref]);

  const stop = useCallback(() => {
    const video_el = video_ref.current;
    if (!video_el) return;
    stop_camera({ video_el });
    stream_ref.current = null;
    set_is_camera_running(false);
    set_is_detected(false);
    set_recognized_profile_id(null);
  }, [video_ref]);

  // Auto-start (camera prompt immediately).
  const did_auto_start_ref = useRef(false);
  useEffect(() => {
    if (did_auto_start_ref.current) return;
    did_auto_start_ref.current = true;
    void start();
    return () => stop();
  }, [start, stop]);

  // Resilience: if the camera stops unexpectedly, try to restart it.
  useEffect(() => {
    if (is_camera_running) return;
    if (!has_started_camera_once_ref.current) return;

    const now = Date.now();
    const cooldown_ms = 10_000;
    if (now - last_camera_restart_at_ref.current < cooldown_ms) return;
    last_camera_restart_at_ref.current = now;

    const id = window.setTimeout(() => void start(), 1200);
    return () => window.clearTimeout(id);
  }, [is_camera_running, start]);

  // Resilience: if the camera is busy (in use), keep retrying until it becomes available.
  useEffect(() => {
    if (is_camera_running) return;
    if (!models_error) return;
    if (!is_camera_busy_error(models_error)) return;

    const id = window.setInterval(() => void start(), CAMERA_BUSY_RETRY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [is_camera_running, models_error, start]);

  // Resilience: if model loading fails, retry periodically (e.g., flaky / blocked CDN).
  useEffect(() => {
    if (!is_camera_running) return;
    if (is_models_loaded) return;
    if (!models_error) return;
    if (is_loading_models_ref.current) return;

    const now = Date.now();
    const retry_every_ms = 20_000;
    if (now - last_models_retry_at_ref.current < retry_every_ms) return;
    last_models_retry_at_ref.current = now;

    const id = window.setTimeout(() => void load_models(), retry_every_ms);
    return () => window.clearTimeout(id);
  }, [is_camera_running, is_models_loaded, load_models, models_error]);

  // Keep profiles/enrollments reasonably fresh (e.g. if enrollments are added via identity_prototype).
  useEffect(() => {
    if (!is_camera_running) return;
    const interval_ms = 15_000;
    const id = window.setInterval(() => {
      if (is_profile_action_running) return;
      void refresh_profiles();
    }, interval_ms);
    return () => window.clearInterval(id);
  }, [is_camera_running, is_profile_action_running, refresh_profiles]);

  // Detection + matching loop.
  // Uses refs for face_matcher, active_profile_id, callbacks, and confirmation
  // tracking so that dependency changes (profile refresh, activation) don't
  // restart the loop and lose in-progress recognition state.
  useEffect(() => {
    if (!is_camera_running || !is_models_loaded) return;

    let cancelled = false;
    let candidate_profile_id: string | null = null;
    let candidate_started_at = 0;
    let candidate_last_seen_at = 0;

    const loop = async () => {
      while (!cancelled) {
        const video_el = video_ref.current;
        if (!video_el) {
          await sleep(120);
          continue;
        }

        const now = performance.now();
        const result = await detect_single_face_descriptor({
          video_el,
          // Lower confidence threshold reduces “dropouts” on slight head turns.
          score_threshold: 0.4,
          with_expressions: true,
        }).catch(() => null);
        if (!result) {
          set_is_detected(false);
          set_detected_emotion(null);

          const confirmed_id = last_confirmed_profile_id_ref.current;
          const confirmed_at = last_confirmed_at_ref.current;
          const should_keep_recognition = Boolean(
            confirmed_id && confirmed_at > 0 && now - confirmed_at < RECOGNITION_GRACE_MS
          );
          if (should_keep_recognition) {
            set_recognized_profile_id(confirmed_id);
          } else {
            set_recognized_profile_id(null);
            last_confirmed_profile_id_ref.current = null;
            last_confirmed_at_ref.current = 0;
          }

          const should_keep_candidate = Boolean(
            candidate_profile_id &&
              candidate_last_seen_at > 0 &&
              now - candidate_last_seen_at < CANDIDATE_GRACE_MS
          );
          if (!should_keep_candidate) {
            candidate_profile_id = null;
            candidate_started_at = 0;
            candidate_last_seen_at = 0;
          }

          const active_id = active_profile_id_ref.current;
          const face_seen_at = last_face_seen_at_ref.current;
          const should_expire =
            active_id &&
            expired_profile_id_ref.current !== active_id &&
            face_seen_at > 0 &&
            now - face_seen_at >= NO_FACE_TIMEOUT_MS;

          if (should_expire) {
            expired_profile_id_ref.current = active_id;
            on_identity_expired_ref.current();
          }

          await sleep(DETECTION_INTERVAL_MS);
          continue;
        }

        set_is_detected(true);
        last_face_seen_at_ref.current = now;

        // Update detected emotion from face expressions
        if (result.expression) {
          set_detected_emotion(result.expression);
        }

        const match = await match_face_descriptor({
          face_matcher: face_matcher_ref.current,
          descriptor: result.descriptor,
        });

        const label = match.profile_id;
        if (label && label !== candidate_profile_id) {
          candidate_profile_id = label;
          candidate_started_at = now;
          candidate_last_seen_at = now;
        }
        if (label && label === candidate_profile_id) {
          candidate_last_seen_at = now;
        }

        if (!label) {
          const should_keep_candidate = Boolean(
            candidate_profile_id &&
              candidate_last_seen_at > 0 &&
              now - candidate_last_seen_at < CANDIDATE_GRACE_MS
          );
          if (!should_keep_candidate) {
            candidate_profile_id = null;
            candidate_started_at = 0;
            candidate_last_seen_at = 0;
          }
        }

        const is_candidate = Boolean(label && candidate_profile_id && label === candidate_profile_id);
        const confirmed = Boolean(
          is_candidate && candidate_started_at > 0 && now - candidate_started_at >= CONFIRM_MS
        );

        if (confirmed && label) {
          set_recognized_profile_id(label);
          last_confirmed_profile_id_ref.current = label;
          last_confirmed_at_ref.current = now;

          // Switch context to the currently confirmed profile.
          const active_id = active_profile_id_ref.current;
          if (active_id !== label) {
            on_change_active_profile_id_ref.current(label);
          }
        } else {
          const confirmed_id = last_confirmed_profile_id_ref.current;
          const confirmed_at = last_confirmed_at_ref.current;
          const should_keep_recognition = Boolean(
            confirmed_id && confirmed_at > 0 && now - confirmed_at < RECOGNITION_GRACE_MS
          );
          if (should_keep_recognition) {
            set_recognized_profile_id(confirmed_id);
          } else {
            set_recognized_profile_id(null);
            last_confirmed_profile_id_ref.current = null;
            last_confirmed_at_ref.current = 0;
          }
        }

        await sleep(DETECTION_INTERVAL_MS);
      }
    };

    void loop();
    return () => {
      cancelled = true;
    };
  }, [is_camera_running, is_models_loaded, video_ref]);

  const capture_profile_enrollment = useCallback(async () => {
    if (is_profile_action_running) return null;
    set_profile_action_error(null);

    if (!is_camera_running || !is_models_loaded) {
      set_profile_action_error("Camera not ready.");
      return null;
    }

    const video_el = video_ref.current;
    if (!video_el) {
      set_profile_action_error("Camera element not ready.");
      return null;
    }

    try {
      const result = await detect_single_face_descriptor({
        video_el,
        input_size: 416,
        score_threshold: 0.4,
      }).catch(() => null);

      if (!result?.descriptor) {
        set_profile_action_error("No face detected. Make sure your face is clearly visible.");
        return null;
      }

      const descriptor = Array.from(result.descriptor);
      const thumbnail = capture_thumbnail_data_url({ video_el }) ?? null;
      return { descriptor, thumbnail };
    } catch (error) {
      set_profile_action_error(
        error instanceof Error ? error.message : "Failed to capture enrollment."
      );
      return null;
    }
  }, [is_camera_running, is_models_loaded, is_profile_action_running, video_ref]);

  const add_profile_enrollment = useCallback(
    async ({ profile_id }: { profile_id: string }) => {
      if (is_profile_action_running) return;
      set_profile_action_error(null);

      const trimmed_profile_id = profile_id.trim();
      if (!trimmed_profile_id) {
        set_profile_action_error("Profile ID is required.");
        return;
      }

      const captured = await capture_profile_enrollment();
      if (!captured) return;

      const base_url = service_url.trim();
      set_is_profile_action_running(true);
      try {
        await identity_add_enrollment({
          base_url,
          profile_id: trimmed_profile_id,
          descriptor: captured.descriptor,
          image_data_url: captured.thumbnail,
        });
        await refresh_profiles();
      } catch (error) {
        set_profile_action_error(
          error instanceof Error ? error.message : "Failed to add enrollment."
        );
      } finally {
        set_is_profile_action_running(false);
      }
    },
    [capture_profile_enrollment, is_profile_action_running, refresh_profiles, service_url]
  );

  const create_profile = useCallback(
    async ({
      name,
      age,
      interests,
      phone_number,
      sms_consent,
      enrollment_descriptors,
      enrollment_thumbnails,
    }: {
      name: string;
      age: number | null;
      interests: string;
      phone_number: string | null;
      sms_consent: boolean;
      enrollment_descriptors: number[][];
      enrollment_thumbnails: Array<string | null>;
    }) => {
      if (is_profile_action_running) return;
      set_profile_action_error(null);

      const base_url = service_url.trim();
      const trimmed_name = name.trim();
      if (!trimmed_name) {
        set_profile_action_error("Name is required.");
        return;
      }

      if (!Array.isArray(enrollment_descriptors) || enrollment_descriptors.length === 0) {
        set_profile_action_error("Capture at least one enrollment first.");
        return;
      }

      set_is_profile_action_running(true);
      try {
        const created = await identity_create_profile({
          base_url,
          name: trimmed_name,
          age,
          interests: interests.trim(),
          phone_number,
          sms_consent,
        });

        for (let i = 0; i < enrollment_descriptors.length; i += 1) {
          await identity_add_enrollment({
            base_url,
            profile_id: created.profile_id,
            descriptor: enrollment_descriptors[i],
            image_data_url: enrollment_thumbnails[i] ?? null,
          });
        }

        await refresh_profiles();
      } catch (error) {
        set_profile_action_error(
          error instanceof Error ? error.message : "Failed to create profile."
        );
      } finally {
        set_is_profile_action_running(false);
      }
    },
    [is_profile_action_running, refresh_profiles, service_url]
  );

  const update_profile = useCallback(
    async ({
      profile_id,
      name,
      age,
      interests,
      phone_number,
      sms_consent,
    }: {
      profile_id: string;
      name: string;
      age: number | null;
      interests: string;
      phone_number: string | null;
      sms_consent: boolean;
    }) => {
      if (is_profile_action_running) return;
      set_profile_action_error(null);

      const base_url = service_url.trim();
      const trimmed_profile_id = profile_id.trim();
      if (!trimmed_profile_id) {
        set_profile_action_error("Profile ID is required.");
        return;
      }

      const trimmed_name = name.trim();
      if (!trimmed_name) {
        set_profile_action_error("Name is required.");
        return;
      }

      if (phone_number && !sms_consent) {
        set_profile_action_error("To save a phone number, please check the SMS consent box.");
        return;
      }
      if (sms_consent && !phone_number) {
        set_profile_action_error("Phone number is required to opt in to SMS messages.");
        return;
      }

      set_is_profile_action_running(true);
      try {
        await identity_patch_profile({
          base_url,
          profile_id: trimmed_profile_id,
          name: trimmed_name,
          age,
          interests: interests.trim(),
          phone_number,
          sms_consent,
        });
        await refresh_profiles();
      } catch (error) {
        set_profile_action_error(
          error instanceof Error ? error.message : "Failed to update profile."
        );
      } finally {
        set_is_profile_action_running(false);
      }
    },
    [is_profile_action_running, refresh_profiles, service_url]
  );

  const delete_profile = useCallback(
    async ({ profile_id, name }: { profile_id: string; name: string }) => {
      if (is_profile_action_running) return;
      const base_url = service_url.trim();
      const ok =
        typeof window !== "undefined" ? window.confirm(`Delete profile \"${name}\"?`) : false;
      if (!ok) return;

      set_is_profile_action_running(true);
      set_profile_action_error(null);
      try {
        await identity_delete_profile({ base_url, profile_id });
        if (active_profile_id === profile_id) {
          on_change_active_profile_id(null);
        }
        await refresh_profiles();
      } catch (error) {
        set_profile_action_error(
          error instanceof Error ? error.message : "Failed to delete profile."
        );
      } finally {
        set_is_profile_action_running(false);
      }
    },
    [active_profile_id, is_profile_action_running, on_change_active_profile_id, refresh_profiles, service_url]
  );

  const view_profile_memory = useCallback(
    async (profile_id: string): Promise<identity_memory | null> => {
      const base_url = service_url.trim();
      try {
        const bundle = await identity_get_profile({ base_url, profile_id });
        return bundle.memory;
      } catch (error) {
        console.warn("[Identity] Failed to load profile memory:", error);
        return null;
      }
    },
    [service_url]
  );

  const view_profile_generated_images = useCallback(
    async (profile_id: string): Promise<identity_generated_image[] | null> => {
      const base_url = service_url.trim();
      try {
        return await identity_list_generated_images({ base_url, profile_id, limit: 50 });
      } catch (error) {
        console.warn("[Identity] Failed to load generated images:", error);
        return null;
      }
    },
    [service_url]
  );

  const delete_profile_memory_item = useCallback(
    async ({
      profile_id,
      kind,
      value,
    }: {
      profile_id: string;
      kind: "tag" | "fact" | "preference" | "note";
      value: string;
    }): Promise<identity_memory | null> => {
      const base_url = service_url.trim();
      const trimmed_value = value.trim();
      if (!trimmed_value) return null;

      try {
        if (kind === "tag") {
          return await identity_patch_memory({
            base_url,
            profile_id,
            tags_unset: [trimmed_value],
          });
        }

        if (kind === "fact") {
          return await identity_patch_memory({
            base_url,
            profile_id,
            facts_remove: [trimmed_value],
          });
        }

        if (kind === "preference") {
          return await identity_patch_memory({
            base_url,
            profile_id,
            preferences_remove: [trimmed_value],
          });
        }

        if (kind === "note") {
          return await identity_patch_memory({
            base_url,
            profile_id,
            notes_remove: [trimmed_value],
          });
        }

        return null;
      } catch (error) {
        console.warn("[Identity] Failed to delete memory item:", error);
        return null;
      }
    },
    [service_url]
  );

  return {
    service_url,
    is_connected,
    connection_error,
    profiles,
    recognized_profile_id,
    is_detected,
    detected_emotion,
    is_models_loaded,
    models_error,
    is_camera_running,
    is_profile_action_running,
    profile_action_error,
    video_ref,
    refresh_profiles,
    capture_profile_enrollment,
    add_profile_enrollment,
    create_profile,
    update_profile,
    delete_profile,
    view_profile_memory,
    view_profile_generated_images,
    delete_profile_memory_item,
  };
};

