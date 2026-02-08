"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ENROLLMENT_CAPTURES_REQUIRED,
  CAPTURE_INSTRUCTIONS,
  normalize_phone_number,
  validate_phone_consent,
} from "./profile_utils";

type CreateProfileModalProps = {
  is_busy: boolean;
  error_message: string | null;
  on_close: () => void;
  on_create: (args: {
    name: string;
    age: number | null;
    interests: string;
    phone_number: string | null;
    sms_consent: boolean;
    enrollment_descriptors: number[][];
    enrollment_thumbnails: Array<string | null>;
  }) => void;
  on_capture_enrollment: () => Promise<{
    descriptor: number[];
    thumbnail: string | null;
  } | null>;
};

export const CreateProfileModal = ({
  is_busy,
  error_message,
  on_close,
  on_create,
  on_capture_enrollment,
}: CreateProfileModalProps) => {
  const [name, set_name] = useState("");
  const [age, set_age] = useState("");
  const [interests, set_interests] = useState("");
  const [phone_number, set_phone_number] = useState("");
  const [sms_consent, set_sms_consent] = useState(false);
  const [create_error, set_create_error] = useState<string | null>(null);
  const [enrollment_descriptors, set_enrollment_descriptors] = useState<
    number[][]
  >([]);
  const [enrollment_thumbnails, set_enrollment_thumbnails] = useState<
    Array<string | null>
  >([]);
  const [is_capturing, set_is_capturing] = useState(false);

  const instruction = useMemo(() => {
    const i = Math.min(enrollment_descriptors.length, 2);
    return CAPTURE_INSTRUCTIONS[i];
  }, [enrollment_descriptors.length]);

  const capture = useCallback(async () => {
    if (is_capturing || is_busy) return;
    if (enrollment_descriptors.length >= ENROLLMENT_CAPTURES_REQUIRED) return;
    set_is_capturing(true);
    try {
      const result = await on_capture_enrollment();
      if (!result) return;
      set_enrollment_descriptors((current) => [...current, result.descriptor]);
      set_enrollment_thumbnails((current) => [...current, result.thumbnail]);
    } finally {
      set_is_capturing(false);
    }
  }, [
    enrollment_descriptors.length,
    is_busy,
    is_capturing,
    on_capture_enrollment,
  ]);

  const submit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (enrollment_descriptors.length < ENROLLMENT_CAPTURES_REQUIRED) return;

    set_create_error(null);
    const normalized_phone = normalize_phone_number(phone_number);
    const phone_error = validate_phone_consent(phone_number, sms_consent);
    if (phone_error) {
      set_create_error(phone_error);
      return;
    }

    const parsed_age = Number.parseInt(age.trim(), 10);
    const age_or_null = Number.isFinite(parsed_age) ? parsed_age : null;
    on_create({
      name: trimmed,
      age: age_or_null,
      interests: interests.trim(),
      phone_number: normalized_phone || null,
      sms_consent: Boolean(sms_consent),
      enrollment_descriptors,
      enrollment_thumbnails,
    });
  }, [
    age,
    enrollment_descriptors,
    enrollment_thumbnails,
    interests,
    name,
    on_create,
    phone_number,
    sms_consent,
  ]);

  const handle_close = useCallback(() => {
    if (is_busy || is_capturing) return;
    on_close();
  }, [is_busy, is_capturing, on_close]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-lg" onClick={handle_close} />
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
      <div
        className="glass-panel relative w-full max-w-2xl rounded-2xl p-5 sm:p-7 shadow-2xl animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create profile"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Create profile
            </p>
            <p className="text-base text-zinc-300">
              Capture {ENROLLMENT_CAPTURES_REQUIRED} enrollments, then create
              the profile.
            </p>
          </div>
          <button
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:border-zinc-600 transition-colors"
            onClick={handle_close}
            disabled={is_busy || is_capturing}
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
              <span className="font-semibold">HELP</span> for help.{" "}
              <a
                className="text-zinc-200 underline"
                href="/legal/terms"
                target="_blank"
                rel="noreferrer"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                className="text-zinc-200 underline"
                href="/legal/privacy"
                target="_blank"
                rel="noreferrer"
              >
                Privacy
              </a>
              .
            </span>
          </label>

          {/* Enrollment captures */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-200">
                Enrollment {enrollment_descriptors.length}/
                {ENROLLMENT_CAPTURES_REQUIRED}
              </p>
              <p className="text-xs text-zinc-400">{instruction}</p>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: ENROLLMENT_CAPTURES_REQUIRED }).map(
                (_, i) => {
                  const src = enrollment_thumbnails[i] ?? null;
                  return (
                    <div
                      key={i}
                      className="flex h-20 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={`Enrollment ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">{i + 1}</span>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void capture()}
                disabled={
                  is_busy ||
                  is_capturing ||
                  enrollment_descriptors.length >= ENROLLMENT_CAPTURES_REQUIRED
                }
                type="button"
              >
                {enrollment_descriptors.length >= ENROLLMENT_CAPTURES_REQUIRED
                  ? "Captures complete"
                  : is_capturing
                    ? "Capturing..."
                    : "Capture"}
              </button>
              <button
                className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200 disabled:opacity-50"
                onClick={submit}
                disabled={
                  is_busy ||
                  !name.trim() ||
                  enrollment_descriptors.length < ENROLLMENT_CAPTURES_REQUIRED
                }
                type="button"
              >
                Create profile
              </button>
            </div>
          </div>

          {create_error && (
            <p className="text-xs text-red-300">{create_error}</p>
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
