import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

/**
 * Landing page.
 *
 * Describes v0 as built: an editor, not a generator. The one genuinely unusual thing it
 * does — taking a script written by an AI agent — gets its own section, because that is
 * the differentiator and it is also true.
 */

const STEPS = [
  {
    title: "Break it into shots",
    body: "A video is an ordered list of shots. Each one gets a line of script and a picture.",
  },
  {
    title: "Add your pictures",
    body: "Photos and video from your camera roll, or a solid colour card for a title beat.",
  },
  {
    title: "Say it out loud",
    body: "Record a voiceover per shot. Shots stretch to fit what you said, so timing looks after itself.",
  },
  {
    title: "Captions and music",
    body: "Captions come from your script. Pick a soundtrack, and it ducks under your voice.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6">
      <section className="flex flex-col items-start gap-6 py-16 sm:py-24">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          Short videos, made on your phone.
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-neutral-400 sm:text-xl">
          {SITE_NAME} turns a script into a short-form video. Write the words, add your pictures,
          record a voiceover, and render something you can post. No account, no sign-in, and your
          projects never leave your phone unless you render one.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-400">
            Coming soon to Android and iPhone
          </span>
          <Link
            href="/agent"
            className="rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white"
          >
            Write a script with an agent
          </Link>
        </div>
      </section>

      <section className="border-t border-neutral-800 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex flex-col gap-2">
              <span className="font-mono text-xs text-neutral-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-semibold text-neutral-100">{step.title}</h3>
              <p className="text-[15px] leading-relaxed text-neutral-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-800 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">Bring your own agent</h2>
        <div className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed text-neutral-400">
          <p className="max-w-2xl text-pretty">
            {SITE_NAME} projects are plain JSON. Ask any AI assistant for a script in that shape,
            save it, and open it in the app — every shot arrives written and waiting for a picture.
            The agent does the structure and the words; you do the pictures.
          </p>
          <Link href="/agent" className="text-sm font-medium text-blue-400 hover:text-blue-300">
            Get the prompt →
          </Link>
        </div>
      </section>

      <section className="border-t border-neutral-800 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">What it does not do</h2>
        <ul className="mt-4 flex max-w-2xl list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-neutral-400">
          <li>No account, and nothing to sign up for.</li>
          <li>No feed, no followers, no posting from inside the app.</li>
          <li>
            No AI image or video generation. {SITE_NAME} edits what you give it — the pictures are
            yours.
          </li>
        </ul>
      </section>
    </main>
  );
}
