import { APP_NAME } from "@mothlight/core";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">{APP_NAME}</h1>
      <p className="max-w-prose text-balance text-lg text-neutral-400">
        AI short-video creation, built for your phone.
      </p>
      <p className="text-xs uppercase tracking-widest text-neutral-600">Coming soon</p>
    </main>
  );
}
