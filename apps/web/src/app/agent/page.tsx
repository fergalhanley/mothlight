import { AGENT_NOTES, AGENT_PROMPT, PROJECT_SCHEMA_VERSION } from "@mothlight/core";
import type { Metadata } from "next";
import { Prose, Section } from "@/components/SiteChrome";
import { SITE_NAME } from "@/lib/site";

/**
 * The docs page the app's "Get the agent skill" screen links to (§2.3).
 *
 * The prompt itself comes from @mothlight/core, which is the same constant the app
 * renders — so the page and the app cannot drift apart and start telling people two
 * different things.
 */
export const metadata: Metadata = {
  title: "Write with an agent",
  description: `Hand this prompt to any AI assistant and open the result in ${SITE_NAME}.`,
};

export default function AgentPage() {
  return (
    <Prose
      title="Write with an agent"
      lead="Ask any AI assistant for a script, then open the result in Mothlight."
    >
      <Section heading="How it works">
        <p>
          {SITE_NAME} projects are plain JSON, and the format is deliberately forgiving: almost
          every field has a default, so a file containing nothing but a name and a few lines of
          script is valid. That is the whole trick. Your assistant writes the structure and the
          words, and every shot arrives in the editor already written, waiting for you to add a
          picture.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {AGENT_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>

      <Section heading="The prompt">
        <p>
          Copy this, replace the topic on the last line, and paste it into your assistant of choice.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised p-4 font-mono text-[13px] leading-relaxed text-foreground">
          <code>{AGENT_PROMPT}</code>
        </pre>
      </Section>

      <Section heading="Opening the result">
        <p>
          Save what you get back as a <span className="font-mono text-[13px]">.json</span> file.
          Then either open it from your Files app, share it to {SITE_NAME}, or use{" "}
          <strong className="text-foreground">Import project…</strong> from the menu on the project
          list. If something is wrong with the file, {SITE_NAME} says which shot has the problem
          rather than showing a stack trace.
        </p>
      </Section>

      <Section heading="Beyond the basics">
        <p>
          The full format — schema version{" "}
          <span className="font-mono text-[13px]">{PROJECT_SCHEMA_VERSION}</span> — also covers
          per-shot durations, captions, text overlays, Ken Burns on stills, video trims, and a
          project soundtrack. The quickest way to see all of it is to build a project in the app and
          use <strong className="text-foreground">Export project</strong>: what comes out is exactly
          what goes back in.
        </p>
      </Section>
    </Prose>
  );
}
