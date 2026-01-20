"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfileManager } from "@/components/identity/profile_manager";
import {
  identity_add_enrollment,
  identity_create_profile,
  identity_delete_profile,
  identity_get_profile,
  identity_list_profiles,
  try_identity_healthz,
} from "@/lib/identity/identity_service_client";
import type { identity_profile_summary } from "@/lib/identity/identity_types";
import { get_identity_service_url } from "@/lib/identity/identity_service_url";
import { DEFAULT_FACEAPI_MODEL_BASE_URL, load_faceapi_models } from "@/lib/identity/faceapi_browser";
import {
  build_face_matcher,
  detect_single_face_descriptor,
  draw_face_overlay,
  match_face_descriptor,
  type identity_match_profile,
} from "@/lib/identity/face_recognition";
import { capture_thumbnail_data_url, start_camera, stop_camera } from "@/lib/identity/camera_browser";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MATCH_THRESHOLD = 0.45;
const CONFIRM_MS = 3000;
const NO_FACE_TIMEOUT_MS = 30_000;
const DETECTION_INTERVAL_MS = 30;
const RENDER_FPS = 30;
const RENDER_INTERVAL_MS = 1000 / RENDER_FPS;
const LOST_AFTER_MS = 400;
const SMOOTHING = 0.35;

export const IdentityPanel = ({
  active_profile_id,
  on_change_active_profile_id,
  on_identity_expired,
}: {
  active_profile_id: string | null;
  on_change_active_profile_id: (next: string | null) => void;
  on_identity_expired: () => void;
}) => {
  const video_ref = useRef<HTMLVideoElement | null>(null);
  const canvas_ref = useRef<HTMLCanvasElement | null>(null);

  const [service_url] = useState<string>(() => get_identity_service_url());
  const [is_connected, set_is_connected] = useState(false);
  const [connection_error, set_connection_error] = useState<string | null>(null);

  const [profiles, set_profiles] = useState<identity_profile_summary[]>([]);
  const [match_profiles, set_match_profiles] = useState<identity_match_profile[]>([]);
  const [face_matcher, set_face_matcher] = useState<any>(null);

  const [is_camera_running, set_is_camera_running] = useState(false);
  const stream_ref = useRef<MediaStream | null>(null);

  const [is_models_loaded, set_is_models_loaded] = useState(false);
  const [models_error, set_models_error] = useState<string | null>(null);

  const [is_detected, set_is_detected] = useState(false);
  const [recognized_profile_id, set_recognized_profile_id] = useState<string | null>(null);
  const [is_profile_action_running, set_is_profile_action_running] = useState(false);
  const [profile_action_error, set_profile_action_error] = useState<string | null>(null);

  const recognized_label = useMemo(() => {
    if (!recognized_profile_id) return "Unknown";
    const match = profiles.find((p) => p.profile_id === recognized_profile_id);
    return match ? match.name : recognized_profile_id;
  }, [profiles, recognized_profile_id]);

  const active_label = useMemo(() => {
    if (!active_profile_id) return "Anonymous";
    const match = profiles.find((p) => p.profile_id === active_profile_id);
    return match ? match.name : active_profile_id;
  }, [active_profile_id, profiles]);

  const capture_profile_enrollment = useCallback(async () => {
    if (is_profile_action_running) return null;
    set_profile_action_error(null);

    if (!is_camera_running || !is_models_loaded) {
      set_profile_action_error("Start the camera and load models first.");
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
        input_size: 320,
        score_threshold: 0.6,
      }).catch(() => null);

      if (!result?.descriptor) {
        set_profile_action_error("No face detected. Make sure your face is clearly visible.");
        return null;
      }

      const descriptor = Array.from(result.descriptor);
      const thumbnail = capture_thumbnail_data_url({ video_el }) ?? null;
      return { descriptor, thumbnail };
    } catch (error) {
      set_profile_action_error(error instanceof Error ? error.message : "Failed to capture enrollment.");
      return null;
    }
  }, [is_camera_running, is_models_loaded, is_profile_action_running]);

  const connect = useCallback(async () => {
    const base_url = service_url.trim();
    const result = await try_identity_healthz({ base_url });
    set_is_connected(result.ok);
    set_connection_error(result.error);
    return result.ok;
  }, [service_url]);

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

      set_match_profiles(next_match_profiles);
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
      set_match_profiles([]);
      set_face_matcher(null);
    }
  }, [service_url]);

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
        set_profile_action_error(error instanceof Error ? error.message : "Failed to create profile.");
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
        set_profile_action_error(error instanceof Error ? error.message : "Failed to delete profile.");
      } finally {
        set_is_profile_action_running(false);
      }
    },
    [
      active_profile_id,
      is_profile_action_running,
      on_change_active_profile_id,
      refresh_profiles,
      service_url,
    ]
  );

  const view_profile_memory = useCallback(
    async (profile_id: string) => {
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

  useEffect(() => {
    void connect().then((ok) => {
      if (ok) void refresh_profiles();
    });
  }, [connect, refresh_profiles]);

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
  }, [refresh_profiles]);

  const stop = useCallback(() => {
    const video_el = video_ref.current;
    if (!video_el) return;
    stop_camera({ video_el });
    stream_ref.current = null;
    set_is_camera_running(false);
    set_is_detected(false);
    set_recognized_profile_id(null);
    const canvas = canvas_ref.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    if (!is_camera_running || !is_models_loaded) return;

    let cancelled = false;
    let candidate_profile_id: string | null = null;
    let candidate_started_at = 0;
    let last_face_seen_at = 0;
    let did_expire = false;
    let target_box: { x: number; y: number; width: number; height: number } | null = null;
    let smoothed_box: { x: number; y: number; width: number; height: number } | null = null;
    let last_detection_dims: { imageWidth?: number; imageHeight?: number } | null = null;
    let last_detection_at = 0;
    let draw_label = "";
    let last_render = 0;
    let last_confirmed_log = 0;

    const clear_overlay = () => {
      const canvas_el = canvas_ref.current;
      const ctx = canvas_el?.getContext("2d");
      if (canvas_el && ctx) ctx.clearRect(0, 0, canvas_el.width, canvas_el.height);
    };

    const detect_loop = async () => {
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
          draw_label = "";

          const should_expire =
            !did_expire &&
            Boolean(active_profile_id) &&
            last_face_seen_at > 0 &&
            now - last_face_seen_at >= NO_FACE_TIMEOUT_MS;

          if (should_expire) {
            const time_since_last_seen = ((now - last_face_seen_at) / 1000).toFixed(1);
            console.log(`[Identity] ✗ Profile EXPIRED after ${time_since_last_seen}s without face detection`);
            did_expire = true;
            on_identity_expired();
          } else if (active_profile_id && last_face_seen_at > 0) {
            const time_since_last_seen = ((now - last_face_seen_at) / 1000).toFixed(1);
            const time_remaining = ((NO_FACE_TIMEOUT_MS - (now - last_face_seen_at)) / 1000).toFixed(1);
            // Only log every ~3 seconds to avoid spam
            if (Math.floor(now / 3000) !== Math.floor((now - DETECTION_INTERVAL_MS) / 3000)) {
              console.log(`[Identity] ⏳ Face lost for ${time_since_last_seen}s, profile expires in ${time_remaining}s`);
            }
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
          const profile_name = match_profiles.find((p) => p.profile_id === label)?.name ?? "Unknown";
          console.log(`[Identity] 👤 Face detected, starting confirmation for: ${profile_name}`);
          candidate_profile_id = label;
          candidate_started_at = now;
        }

        if (!label) {
          if (candidate_profile_id) {
            console.log(`[Identity] ⚠ Lost match, resetting confirmation timer`);
          }
          candidate_profile_id = null;
          candidate_started_at = 0;
        }

        const is_candidate = Boolean(label && candidate_profile_id && label === candidate_profile_id);
        const confirmed = Boolean(is_candidate && candidate_started_at > 0 && now - candidate_started_at >= CONFIRM_MS);

        if (confirmed && label) {
          const profile_name = match_profiles.find((p) => p.profile_id === label)?.name ?? "Unknown";
          
          set_recognized_profile_id(label);
          
          // Bind the session to the first confirmed profile. This prevents
          // mid-conversation switches and keeps the chat context intact.
          if (!active_profile_id) {
            console.log(`[Identity] ✓ Profile CONFIRMED & ACTIVATED: ${profile_name} (${label})`);
            on_change_active_profile_id(label);
            last_confirmed_log = now;
          } else if (active_profile_id === label) {
            // Already the active profile, just confirmed again - log only every 5 seconds
            if (now - last_confirmed_log >= 5000) {
              console.log(`[Identity] ✓ Profile CONFIRMED (already active): ${profile_name} (${label})`);
              last_confirmed_log = now;
            }
          } else {
            // Different profile detected while another is active
            console.log(`[Identity] ⚠ Profile CONFIRMED but different from active: ${profile_name} vs active=${active_profile_id}`);
          }
        } else {
          set_recognized_profile_id(null);
          if (is_candidate && candidate_started_at > 0) {
            const elapsed = now - candidate_started_at;
            const remaining = CONFIRM_MS - elapsed;
            const profile_name = match_profiles.find((p) => p.profile_id === label)?.name ?? "Unknown";
            // Only log every 0.5 seconds to reduce spam
            if (Math.floor(now / 500) !== Math.floor((now - DETECTION_INTERVAL_MS) / 500)) {
              console.log(`[Identity] ⏱ Confirming ${profile_name}... ${(remaining / 1000).toFixed(1)}s remaining`);
            }
          }
        }

        draw_label =
          confirmed && label
            ? match_profiles.find((p) => p.profile_id === label)?.name ?? "Unknown"
            : "";

        const raw_box = result?.detection?.detection?.box;
        if (raw_box) {
          target_box = {
            x: raw_box.x,
            y: raw_box.y,
            width: raw_box.width,
            height: raw_box.height,
          };
          last_detection_dims = {
            imageWidth: result?.detection?.detection?.imageWidth,
            imageHeight: result?.detection?.detection?.imageHeight,
          };
          last_detection_at = performance.now();
        } else {
          target_box = null;
          smoothed_box = null;
          last_detection_dims = null;
          last_detection_at = 0;
        }

        await sleep(DETECTION_INTERVAL_MS);
      }
    };

    const render_loop = (ts: number) => {
      if (cancelled) return;
      if (ts - last_render >= RENDER_INTERVAL_MS) {
        last_render = ts;
        const video_el = video_ref.current;
        const canvas_el = canvas_ref.current;
        const video_ok = (video_el?.videoWidth || 0) > 0 && (video_el?.videoHeight || 0) > 0;
        const now = performance.now();

        if (!video_el || !canvas_el || !video_ok) {
          clear_overlay();
        } else if (!target_box || (last_detection_at && now - last_detection_at > LOST_AFTER_MS)) {
          if (target_box || smoothed_box) {
            target_box = null;
            smoothed_box = null;
            last_detection_dims = null;
            last_detection_at = 0;
            clear_overlay();
          }
        } else {
          if (!smoothed_box) {
            smoothed_box = { ...target_box };
          } else {
            smoothed_box = {
              x: smoothed_box.x + (target_box.x - smoothed_box.x) * SMOOTHING,
              y: smoothed_box.y + (target_box.y - smoothed_box.y) * SMOOTHING,
              width: smoothed_box.width + (target_box.width - smoothed_box.width) * SMOOTHING,
              height: smoothed_box.height + (target_box.height - smoothed_box.height) * SMOOTHING,
            };
          }

          const draw_detection = {
            box: smoothed_box,
            imageWidth: last_detection_dims?.imageWidth,
            imageHeight: last_detection_dims?.imageHeight,
          };

          void draw_face_overlay({
            canvas_el,
            video_el,
            detection: draw_detection,
            label: draw_label,
            mirror: true,
          }).catch(() => undefined);
        }
      }

      requestAnimationFrame(render_loop);
    };

    void detect_loop();
    requestAnimationFrame(render_loop);
    return () => {
      cancelled = true;
    };
  }, [
    is_camera_running,
    is_models_loaded,
    face_matcher,
    match_profiles,
    active_profile_id,
    on_change_active_profile_id,
    on_identity_expired,
  ]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Identity
            </p>
            <p className="text-sm text-zinc-300">
              Automatic face recognition and profile routing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-1 text-xs ${
                is_connected
                  ? "border-emerald-700/50 text-emerald-300"
                  : "border-zinc-700 text-zinc-300"
              }`}
            >
              {is_connected ? "connected" : "offline"}
            </span>
          </div>
        </div>

        {connection_error ? <p className="text-xs text-red-300">{connection_error}</p> : null}

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-zinc-400">Active profile</span>
            <span className="text-zinc-200">{active_label}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Camera
                </p>
                <span className="text-xs text-zinc-400">
                  {is_camera_running ? "running" : "stopped"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => void start()}
                  disabled={is_camera_running}
                >
                  Start
                </button>
                <button
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => stop()}
                  disabled={!is_camera_running}
                >
                  Stop
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
              <video
                ref={video_ref}
                muted
                playsInline
                className="h-56 w-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              <canvas
                ref={canvas_ref}
                className="absolute inset-0 h-full w-full"
              />
            </div>

            {models_error ? <p className="text-xs text-red-300">{models_error}</p> : null}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Recognition
            </p>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-400">Detected</span>
              <span className={is_detected ? "text-emerald-300" : "text-zinc-300"}>
                {is_detected ? "yes" : "no"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-400">Recognized</span>
              <span className="text-zinc-200">{recognized_label}</span>
            </div>
          </div>
        </div>

        <ProfileManager
          profiles={profiles}
          is_camera_running={is_camera_running}
          is_models_loaded={is_models_loaded}
          is_busy={is_profile_action_running}
          error_message={profile_action_error}
          on_refresh={() => void refresh_profiles()}
          on_delete_profile={(args) => void delete_profile(args)}
          on_create_profile={(args) => void create_profile(args)}
          on_capture_enrollment={capture_profile_enrollment}
          on_view_memory={view_profile_memory}
        />
      </div>
    </section>
  );
};
