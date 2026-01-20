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
} from "@/lib/identity/face_recognition";
import {
  capture_thumbnail_data_url,
  start_camera,
  stop_camera,
} from "@/lib/identity/camera_browser";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MATCH_THRESHOLD = 0.45;
const CONFIRM_MS = 3000;
const NO_FACE_TIMEOUT_MS = 30_000;
const DETECTION_INTERVAL_MS = 30;

export type identity_runtime = {
  service_url: string;
  is_connected: boolean;
  connection_error: string | null;

  profiles: identity_profile_summary[];
  recognized_profile_id: string | null;
  is_detected: boolean;

  is_models_loaded: boolean;
  models_error: string | null;
  is_camera_running: boolean;

  is_profile_action_running: boolean;
  profile_action_error: string | null;

  video_ref: RefObject<HTMLVideoElement | null>;

  refresh_profiles: () => Promise<void>;
  capture_profile_enrollment: () => Promise<{ descriptor: number[]; thumbnail: string | null } | null>;
  create_profile: (args: {
    name: string;
    age: number | null;
    interests: string;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
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

  const [is_profile_action_running, set_is_profile_action_running] = useState(false);
  const [profile_action_error, set_profile_action_error] = useState<string | null>(null);

  const refresh_profiles = useCallback(async () => {
    const base_url = service_url.trim();
    try {
      const list = await identity_list_profiles({ base_url });
      set_profiles(list);

      const bundles = await Promise.all(
        list.map(async (p) => {
          try {
            return await identity_get_profile({ base_url, profile_id: p.profile_id });
          } catch {
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

  const start = useCallback(async () => {
    const video_el = video_ref.current;
    if (!video_el) return;

    set_models_error(null);
    set_is_models_loaded(false);

    try {
      await load_faceapi_models({ base_url: DEFAULT_FACEAPI_MODEL_BASE_URL });
      set_is_models_loaded(true);
      set_models_error(null);
    } catch (error) {
      set_models_error(error instanceof Error ? error.message : "Failed to load face models");
      set_is_models_loaded(false);
      return;
    }

    try {
      const stream = await start_camera({ video_el });
      stream_ref.current = stream;
      set_is_camera_running(true);
    } catch (error) {
      set_models_error(error instanceof Error ? error.message : "Failed to start camera");
      return;
    }

    void refresh_profiles();
  }, [refresh_profiles, video_ref]);

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

  // Detection + matching loop
  useEffect(() => {
    if (!is_camera_running || !is_models_loaded) return;

    let cancelled = false;
    let candidate_profile_id: string | null = null;
    let candidate_started_at = 0;
    let last_face_seen_at = 0;
    let did_expire = false;

    const loop = async () => {
      while (!cancelled) {
        const video_el = video_ref.current;
        if (!video_el) {
          await sleep(120);
          continue;
        }

        const now = performance.now();
        const result = await detect_single_face_descriptor({ video_el }).catch(() => null);
        if (!result) {
          set_is_detected(false);
          set_recognized_profile_id(null);
          candidate_profile_id = null;
          candidate_started_at = 0;

          const should_expire =
            !did_expire &&
            Boolean(active_profile_id) &&
            last_face_seen_at > 0 &&
            now - last_face_seen_at >= NO_FACE_TIMEOUT_MS;

          if (should_expire) {
            did_expire = true;
            on_identity_expired();
          }

          await sleep(DETECTION_INTERVAL_MS);
          continue;
        }

        set_is_detected(true);
        last_face_seen_at = now;

        const match = await match_face_descriptor({
          face_matcher,
          descriptor: result.descriptor,
        });

        const label = match.profile_id;
        if (label && label !== candidate_profile_id) {
          candidate_profile_id = label;
          candidate_started_at = now;
        }

        if (!label) {
          candidate_profile_id = null;
          candidate_started_at = 0;
        }

        const is_candidate = Boolean(label && candidate_profile_id && label === candidate_profile_id);
        const confirmed = Boolean(
          is_candidate && candidate_started_at > 0 && now - candidate_started_at >= CONFIRM_MS
        );

        if (confirmed && label) {
          set_recognized_profile_id(label);

          // Switch context to the currently confirmed profile.
          if (active_profile_id !== label) on_change_active_profile_id(label);
        } else {
          set_recognized_profile_id(null);
        }

        await sleep(DETECTION_INTERVAL_MS);
      }
    };

    void loop();
    return () => {
      cancelled = true;
    };
  }, [
    is_camera_running,
    is_models_loaded,
    face_matcher,
    active_profile_id,
    on_change_active_profile_id,
    on_identity_expired,
    video_ref,
  ]);

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

  const create_profile = useCallback(
    async ({
      name,
      age,
      interests,
      enrollment_descriptors,
      enrollment_thumbnails,
    }: {
      name: string;
      age: number | null;
      interests: string;
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
        console.error("Failed to fetch profile memory:", error);
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
        console.error("Failed to fetch profile images:", error);
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
        console.error("Failed to delete memory item:", error);
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
    is_models_loaded,
    models_error,
    is_camera_running,
    is_profile_action_running,
    profile_action_error,
    video_ref,
    refresh_profiles,
    capture_profile_enrollment,
    create_profile,
    delete_profile,
    view_profile_memory,
    view_profile_generated_images,
    delete_profile_memory_item,
  };
};

