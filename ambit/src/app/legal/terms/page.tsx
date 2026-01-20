"use client";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Terms of Service</h1>

        <p className="mt-4 text-sm text-zinc-300">
          Ambit is an experimental research project. Use at your own discretion.
        </p>

        <div className="mt-8 space-y-6 text-sm text-zinc-300">
          <section>
            <h2 className="text-base font-semibold text-zinc-100">SMS messaging (optional)</h2>
            <p className="mt-2">
              If you opt in to receive SMS messages from Ambit, message frequency varies. Message and
              data rates may apply. You can opt out at any time by replying <span className="font-semibold">STOP</span>.
              For help, reply <span className="font-semibold">HELP</span>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">No emergency use</h2>
            <p className="mt-2">Ambit is not a medical, legal, or emergency service.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-100">Contact</h2>
            <p className="mt-2">
              For support, contact: <span className="font-mono">support@ambit.example</span>
            </p>
          </section>
        </div>

        <p className="mt-10 text-xs text-zinc-500">Last updated: 2026-01-20</p>
      </div>
    </main>
  );
}

