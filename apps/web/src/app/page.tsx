import Image from "next/image";
import Link from "next/link";
import mothIcon from "@/app/assets/mothlight-icon.png";
import { SpectrumRule } from "@/components/SiteChrome";
import { SITE_NAME } from "@/lib/site";

/**
 * Landing page.
 *
 * Describes v0 as built: an editor, not a generator. The one genuinely unusual thing it
 * does — taking a script written by an AI agent — gets its own section, because that is
 * the differentiator and it is also true.
 *
 * The four wing colours run in the artwork's own order (violet, pink, amber, green) and
 * are attached to the four steps, so the page and the logo read as one object.
 */

const STEPS = [
  {
    accent: "text-moth-violet",
    rule: "bg-moth-violet",
    title: "Break it into shots",
    body: "A video is an ordered list of shots. Each one gets a line of script and a picture.",
  },
  {
    accent: "text-moth-pink",
    rule: "bg-moth-pink",
    title: "Add your pictures",
    body: "Photos and video from your camera roll, or a solid colour card for a title beat.",
  },
  {
    accent: "text-moth-amber",
    rule: "bg-moth-amber",
    title: "Say it out loud",
    body: "Record a voiceover per shot. Shots stretch to fit what you said, so timing looks after itself.",
  },
  {
    accent: "text-moth-green",
    rule: "bg-moth-green",
    title: "Captions and music",
    body: "Captions come from your script. Pick a soundtrack, and it ducks under your voice.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero ------------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute inset-x-0 top-0 mx-auto h-[420px] max-w-3xl opacity-45"
        />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pt-10 pb-20 text-center sm:pt-14 sm:pb-28">
          <Image
            src={mothIcon}
            alt={`${SITE_NAME} — a moth lit in violet, pink, amber, and green`}
            width={712}
            height={712}
            priority
            sizes="(max-width: 640px) 88vw, 460px"
            className="moth-vignette h-auto w-[min(88vw,460px)] select-none"
          />

          {/* No negative margin: the moth's glow washes out text laid over it, and the
              vignette already closes the gap visually. */}
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Short videos, made on your phone.
          </h1>

          <p className="mt-5 max-w-2xl text-pretty text-lg text-muted sm:text-xl">
            {SITE_NAME} turns a script into a short-form video. Write the words, add your pictures,
            record a voiceover, and render something you can post. No account, no sign-in, and your
            projects never leave your phone unless you render one.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/agent"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Write a script with an agent
            </Link>
            <span className="rounded-full border border-border-subtle px-5 py-2.5 text-sm text-muted">
              Coming soon to Android and iPhone
            </span>
          </div>
        </div>
      </section>

      {/* How it works ----------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-5xl px-6">
        <SpectrumRule className="opacity-30" />

        <div className="py-14 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>

          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm font-semibold ${step.accent}`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span aria-hidden className={`h-px flex-1 ${step.rule} opacity-35`} />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent workflow --------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-5xl px-6">
        <SpectrumRule className="opacity-30" />

        <div className="py-14 sm:py-20">
          <div className="rounded-2xl border border-border-subtle bg-surface p-7 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Bring your own agent
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted">
              {SITE_NAME} projects are plain JSON. Ask any AI assistant for a script in that shape,
              save it, and open it in the app — every shot arrives written and waiting for a
              picture. The agent does the structure and the words; you do the pictures.
            </p>
            <Link
              href="/agent"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-moth-green transition-opacity hover:opacity-80"
            >
              Get the prompt <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Honesty ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-5xl px-6">
        <SpectrumRule className="opacity-30" />

        <div className="py-14 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What it does not do</h2>
          <ul className="mt-6 flex max-w-2xl flex-col gap-3 text-[15px] leading-relaxed text-muted">
            {[
              "No account, and nothing to sign up for.",
              "No feed, no followers, no posting from inside the app.",
              `No AI image or video generation. ${SITE_NAME} edits what you give it — the pictures are yours.`,
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-faint" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
