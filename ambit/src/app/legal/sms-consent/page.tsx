"use client";

export default function SmsConsentPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Messaging</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">SMS Opt-In &amp; Consent</h1>

        <p className="mt-4 text-sm text-zinc-300">
          Ambit only sends SMS messages to users who explicitly opt in. Opt-in is collected during
          profile creation via a checkbox consent statement and an optional phone number field.
        </p>

        <div className="mt-8 space-y-6 text-sm text-zinc-300">
          <section>
            <h2 className="text-base font-semibold text-zinc-100">How users opt in</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>User enters their phone number (E.164 format recommended, e.g. +15551234567).</li>
              <li>
                User checks the consent box: “I agree to receive SMS messages from Ambit…” including
                STOP/HELP language and links to Terms/Privacy.
              </li>
              <li>If consent is not checked, the phone number is not saved.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">Use case</h2>
            <p className="mt-2">
              Optional user-requested messages such as short reminders, follow-ups, or notifications
              initiated by the user’s interaction with Ambit (customer care / account notifications).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">STOP / HELP</h2>
            <p className="mt-2">
              Users can opt out at any time by replying <span className="font-semibold">STOP</span>. For help,
              users can reply <span className="font-semibold">HELP</span>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">Sample messages</h2>
            <div className="mt-2 space-y-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-500">Opt-in confirmation (optional)</p>
                <p className="mt-1">
                  Ambit: You’re opted in for SMS updates. Msg &amp; data rates may apply. Reply STOP to opt out,
                  HELP for help.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-500">Help message</p>
                <p className="mt-1">
                  Ambit: Help — Reply STOP to opt out. For support email support@ambit.example. Msg &amp; data rates may apply.
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-500">Notification example</p>
                <p className="mt-1">
                  Ambit: Quick reminder — you asked me to follow up about your project today. Want to pick it back up?
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">Links</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Terms: <a className="underline" href="/legal/terms">/legal/terms</a>
              </li>
              <li>
                Privacy: <a className="underline" href="/legal/privacy">/legal/privacy</a>
              </li>
            </ul>
          </section>
        </div>

        <p className="mt-10 text-xs text-zinc-500">Last updated: 2026-01-20</p>
      </div>
    </main>
  );
}

