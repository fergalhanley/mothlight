import type { Metadata } from "next";
import Link from "next/link";
import { Prose, Section } from "@/components/SiteChrome";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

/** Support page. Both stores require a reachable support URL on the listing. */
export const metadata: Metadata = {
  title: "Support",
  description: `Get help with ${SITE_NAME}, or report a problem.`,
};

export default function SupportPage() {
  return (
    <Prose title="Support" lead="Something not working? Tell us and we will look.">
      <Section heading="Get in touch">
        <p>
          Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
          >
            {CONTACT_EMAIL}
          </a>
          . It is read by the person who builds {SITE_NAME}, so please be specific and expect a
          reply from a human rather than a ticket number.
        </p>
        <p>If you are reporting a bug, these three things make it much faster to fix:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Your phone and OS version — for example &ldquo;Pixel 8, Android 15&rdquo;.</li>
          <li>What you were doing when it went wrong.</li>
          <li>What you expected instead.</li>
        </ul>
      </Section>

      <Section heading="Common questions">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold text-neutral-100">Do I need an account?</h3>
            <p>
              No. There is no sign-in, and there is nothing to create. Your projects live on your
              phone.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold text-neutral-100">Where did my project go?</h3>
            <p>
              Projects are stored on the device, so they do not follow you to a new phone and they
              are removed if you delete the app. You can export a project as a{" "}
              <span className="font-mono text-[13px]">.json</span> file from the editor menu to keep
              a copy or move it yourself.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold text-neutral-100">I deleted a project by accident.</h3>
            <p>
              Deleting shows an UNDO button for a few seconds. Once that disappears the project and
              its files are gone, and we have no copy to restore — we never had one.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold text-neutral-100">Does rendering need the internet?</h3>
            <p>
              Yes. Rendering happens on our servers, so it needs a connection and it uploads the
              media in your project. Everything else — writing, editing, recording, previewing —
              works offline. See the{" "}
              <Link
                href="/privacy"
                className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
              >
                privacy page
              </Link>{" "}
              for exactly what gets uploaded and how long it is kept.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold text-neutral-100">Can an AI write my script?</h3>
            <p>
              Yes, using your own assistant.{" "}
              <Link
                href="/agent"
                className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
              >
                Here is the prompt
              </Link>
              . {SITE_NAME} itself does not generate anything.
            </p>
          </div>
        </div>
      </Section>
    </Prose>
  );
}
