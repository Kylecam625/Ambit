"use client";

import { useCallback, useMemo, useState } from "react";
import type { identity_profile_summary } from "@/lib/identity/identity_types";
import { normalize_phone_number, validate_phone_consent } from "./profile_utils";

type EditProfileModalProps = {
  profile: identity_profile_summary;
  profiles: identity_profile_summary[];
  is_busy: boolean;
  can_enroll: boolean;
  error_message: string | null;
  on_close: () => void;
  on_save: (args: {
    profile_id: string;
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
  }) => void;
  on_add_enrollment: (args: { profile_id: string }) => Promise<void> | void;
};

export const EditProfileModal = ({
  profile,
  profiles,
  is_busy,
  can_enroll,
  error_message,
  on_close,
  on_save,
  on_add_enrollment,
}: EditProfileModalProps) => {
  const [name, set_name] = useState(profile.name || "");
  const [age, set_age] = useState(
    typeof profile.age === "number" ? String(profile.age) : ""
  );
  const [interests, set_interests] = useState(profile.interests || "");
  const [phone_number, set_phone_number] = useState(
    profile.phone_number || ""
  );
  const [sms_consent, set_sms_consent] = useState(
    Boolean(profile.sms_consent)
  );
  const [edit_error, set_edit_error] = useState<string | null>(null);
  const [is_adding_enrollment, set_is_adding_enrollment] = useState(false);

  const editing_profile = useMemo(
    () => profiles.find((p) => p.profile_id === profile.profile_id) ?? null,
    [profile.profile_id, profiles]
  );

  const save = useCallback(async () => {
    if (is_busy || is_adding_enrollment) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    set_edit_error(null);
    const phone_error = validate_phone_consent(phone_number, sms_consent);
    if (phone_error) {
      set_edit_error(phone_error);
      return;
    }

    const normalized_phone = normalize_phone_number(phone_number);
    const parsed_age = Number.parseInt(age.trim(), 10);
    const age_or_null = Number.isFinite(parsed_age) ? parsed_age : null;

    on_save({
      profile_id: profile.profile_id,
      name: trimmed,
      age: age_or_null,
      interests: interests.trim(),
      phone_number: normalized_phone || null,
      sms_consent: Boolean(sms_consent),
    });
    on_close();
  }, [
    age,
    interests,
    is_adding_enrollment,
    is_busy,
    name,
    on_close,
    on_save,
    phone_number,
    profile.profile_id,
    sms_consent,
  ]);

  const add_enrollment = useCallback(async () => {
    if (is_busy || is_adding_enrollment) return;
    set_edit_error(null);
    set_is_adding_enrollment(true);
    try {
      await on_add_enrollment({ profile_id: profile.profile_id });
    } finally {
      set_is_adding_enrollment(false);
    }
  }, [is_adding_enrollment, is_busy, on_add_enrollment, profile.profile_id]);

  const handle_close = useCallback(() => {
    if (is_busy || is_adding_enrollment) return;
    on_close();
  }, [is_adding_enrollment, is_busy, on_close]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-lg" onClick={handle_close} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
      <div
        className="glass-panel relative w-full max-w-2xl rounded-2xl p-5 sm:p-7 shadow-2xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit profile"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Edit profile
            </p>
            <p className="text-base text-zinc-300">
              Update details anytime. Add enrollments to improve recognition
              during head turns.
            </p>
          </div>
          <button
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:border-zinc-600 transition-colors"
            onClick={handle_close}
            disabled={is_busy || is_adding_enrollment}
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Name</span>
            <input
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              value={name}
              onChange={(e) => set_name(e.target.value)}
              placeholder="Kyle"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">Age (optional)</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                value={age}
                onChange={(e) => set_age(e.target.value)}
                placeholder="27"
                inputMode="numeric"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">
                Interests (optional)
              </span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                value={interests}
                onChange={(e) => set_interests(e.target.value)}
                placeholder="music, startups, space"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">
              Phone number (optional)
            </span>
            <input
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              value={phone_number}
              onChange={(e) => set_phone_number(e.target.value)}
              placeholder="+15551234567"
              inputMode="tel"
              autoComplete="tel"
            />
            <span className="text-[11px] text-zinc-500">
              Add this only if you want Ambit to text you. We require explicit
              opt-in.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900"
              checked={sms_consent}
              onChange={(e) => set_sms_consent(e.target.checked)}
            />
            <span className="text-sm text-zinc-300">
              I agree to receive SMS messages from Ambit at the phone number
              provided. Message &amp; data rates may apply. Reply{" "}
              <span className="font-semibold">STOP</span> to opt out and{" "}
              <span className="font-semibold">HELP</span> for help.
            </span>
          </label>

          {/* Enrollment section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-200">Enrollments</p>
              <p className="text-xs text-zinc-400">
                {editing_profile
                  ? `${editing_profile.descriptor_count} captured`
                  : "\u2014"}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Add a few more captures while you look LEFT/RIGHT and slightly
              UP/DOWN.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void add_enrollment()}
                disabled={is_busy || is_adding_enrollment || !can_enroll}
                type="button"
              >
                {is_adding_enrollment ? "Capturing..." : "Add enrollment"}
              </button>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 disabled:opacity-50"
              onClick={() => void save()}
              disabled={is_busy || !name.trim() || is_adding_enrollment}
              type="button"
            >
              Save changes
            </button>
          </div>

          {edit_error && (
            <p className="text-xs text-red-300">{edit_error}</p>
          )}
          {error_message && (
            <p className="text-xs text-red-300">{error_message}</p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};
