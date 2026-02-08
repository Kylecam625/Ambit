"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  identity_profile_summary,
  identity_memory,
  identity_generated_image,
} from "@/lib/identity/identity_types";
import { ProfileList } from "./profile_list";
import { CreateProfileModal } from "./create_profile_modal";
import { EditProfileModal } from "./edit_profile_modal";
import { MemoryViewer } from "./memory_viewer";
import { GeneratedImagesViewer } from "./generated_images_viewer";

export const ProfileManager = ({
  profiles,
  is_camera_running,
  is_models_loaded,
  is_busy,
  error_message,
  recognized_profile_id = null,
  recognized_label = "Unknown",
  on_refresh,
  on_delete_profile,
  on_create_profile,
  on_update_profile,
  on_capture_enrollment,
  on_add_profile_enrollment,
  on_view_memory,
  on_view_generated_images,
  on_delete_memory_item,
}: {
  profiles: identity_profile_summary[];
  is_camera_running: boolean;
  is_models_loaded: boolean;
  is_busy: boolean;
  error_message: string | null;
  recognized_profile_id?: string | null;
  recognized_label?: string;
  on_refresh: () => void;
  on_delete_profile: (args: { profile_id: string; name: string }) => void;
  on_create_profile: (args: {
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
  }) => void;
  on_update_profile: (args: {
    profile_id: string;
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
  }) => void;
  on_capture_enrollment: () => Promise<{
    descriptor: number[];
    thumbnail: string | null;
  } | null>;
  on_add_profile_enrollment: (args: {
    profile_id: string;
  }) => Promise<void> | void;
  on_view_memory: (profile_id: string) => Promise<identity_memory | null>;
  on_view_generated_images: (
    profile_id: string
  ) => Promise<identity_generated_image[] | null>;
  on_delete_memory_item: (args: {
    profile_id: string;
    kind: "tag" | "fact" | "preference" | "note";
    value: string;
  }) => Promise<identity_memory | null>;
}) => {
  /* ---- Modal visibility state ---- */
  const [is_create_open, set_is_create_open] = useState(false);
  const [editing_profile, set_editing_profile] =
    useState<identity_profile_summary | null>(null);

  const [memory_target, set_memory_target] = useState<{
    profile_id: string;
    name: string;
  } | null>(null);
  const [images_target, set_images_target] = useState<{
    profile_id: string;
    name: string;
  } | null>(null);

  /* ---- Gate errors ---- */
  const [memory_gate_error, set_memory_gate_error] = useState<string | null>(
    null
  );
  const [images_gate_error, set_images_gate_error] = useState<string | null>(
    null
  );

  useEffect(() => {
    set_memory_gate_error(null);
    set_images_gate_error(null);
  }, [recognized_profile_id]);

  const can_open_modal = Boolean(
    is_camera_running && is_models_loaded && !is_busy
  );

  /* ---- Memory gate check ---- */
  const handle_view_memory = useCallback(
    (profile_id: string, name: string) => {
      const is_allowed = Boolean(
        recognized_profile_id && recognized_profile_id === profile_id
      );
      if (!is_allowed) {
        const recognized = recognized_profile_id
          ? recognized_label || recognized_profile_id
          : "None";
        set_memory_gate_error(
          `Memory locked. Currently recognized: ${recognized}. To view ${name}'s memory, their face must be recognized.`
        );
        return;
      }
      set_memory_gate_error(null);
      set_memory_target({ profile_id, name });
    },
    [recognized_label, recognized_profile_id]
  );

  /* ---- Images gate check ---- */
  const handle_view_images = useCallback(
    (profile_id: string, name: string) => {
      const is_allowed = Boolean(
        recognized_profile_id && recognized_profile_id === profile_id
      );
      if (!is_allowed) {
        const recognized = recognized_profile_id
          ? recognized_label || recognized_profile_id
          : "None";
        set_images_gate_error(
          `Images locked. Currently recognized: ${recognized}. To view ${name}'s images, their face must be recognized.`
        );
        return;
      }
      set_images_gate_error(null);
      set_images_target({ profile_id, name });
    },
    [recognized_label, recognized_profile_id]
  );

  /* ---- Create handler ---- */
  const handle_create = useCallback(
    (args: Parameters<typeof on_create_profile>[0]) => {
      on_create_profile(args);
      set_is_create_open(false);
    },
    [on_create_profile]
  );

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/70 p-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Profiles
          </p>
          <p className="text-xs text-zinc-400">{profiles.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
            onClick={on_refresh}
            disabled={is_busy}
            type="button"
          >
            Refresh
          </button>
          <button
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => set_is_create_open(true)}
            disabled={!can_open_modal}
            type="button"
          >
            New profile
          </button>
        </div>
      </div>

      {/* Gate errors */}
      {memory_gate_error && (
        <p className="mt-2 text-xs text-red-300">{memory_gate_error}</p>
      )}
      {images_gate_error && (
        <p className="mt-2 text-xs text-red-300">{images_gate_error}</p>
      )}
      {error_message && (
        <p className="mt-2 text-xs text-red-300">{error_message}</p>
      )}

      {/* Profile list */}
      <ProfileList
        profiles={profiles}
        is_busy={is_busy}
        is_loading_memory={!!memory_target}
        is_loading_images={!!images_target}
        recognized_profile_id={recognized_profile_id ?? null}
        on_edit={set_editing_profile}
        on_delete={on_delete_profile}
        on_view_memory={handle_view_memory}
        on_view_images={handle_view_images}
      />

      {/* Modals */}
      {is_create_open && (
        <CreateProfileModal
          is_busy={is_busy}
          error_message={error_message}
          on_close={() => set_is_create_open(false)}
          on_create={handle_create}
          on_capture_enrollment={on_capture_enrollment}
        />
      )}

      {editing_profile && (
        <EditProfileModal
          profile={editing_profile}
          profiles={profiles}
          is_busy={is_busy}
          can_enroll={can_open_modal}
          error_message={error_message}
          on_close={() => set_editing_profile(null)}
          on_save={on_update_profile}
          on_add_enrollment={on_add_profile_enrollment}
        />
      )}

      {memory_target && (
        <MemoryViewer
          profile_id={memory_target.profile_id}
          profile_name={memory_target.name}
          is_busy={is_busy}
          recognized_profile_id={recognized_profile_id ?? null}
          recognized_label={recognized_label}
          on_close={() => set_memory_target(null)}
          on_view_memory={on_view_memory}
          on_delete_memory_item={on_delete_memory_item}
        />
      )}

      {images_target && (
        <GeneratedImagesViewer
          profile_id={images_target.profile_id}
          profile_name={images_target.name}
          on_close={() => set_images_target(null)}
          on_view_generated_images={on_view_generated_images}
        />
      )}
    </div>
  );
};
