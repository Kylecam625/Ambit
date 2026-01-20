"use client";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>

        <p className="mt-4 text-sm text-zinc-300">
          Ambit is an experimental research project. This page describes the data we collect and why.
        </p>

        <div className="mt-8 space-y-6 text-sm text-zinc-300">
          <section>
            <h2 className="text-base font-semibold text-zinc-100">What we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Profile information you enter (e.g. name, optional age/interests).</li>
              <li>
                If you opt in to SMS: your phone number and a record of your consent (timestamp).
              </li>
              <li>Conversation history and derived memory summaries (if enabled).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">How we use it</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>To personalize Ambit’s responses for the active profile.</li>
              <li>To send optional SMS messages only when you explicitly opt in.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">Opt-out</h2>
            <p className="mt-2">
              You can opt out of SMS at any time by replying <span className="font-semibold">STOP</span>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">Contact</h2>
            <p className="mt-2">
              Privacy questions: <span className="font-mono">privacy@ambit.example</span>
            </p>
          </section>
        </div>

        <p className="mt-10 text-xs text-zinc-500">Last updated: 2026-01-20</p>
      </div>
    </main>
  );
}

