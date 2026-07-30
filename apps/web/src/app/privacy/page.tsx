import type { Metadata } from "next";
import { Prose, Section } from "@/components/SiteChrome";
import { CONTACT_EMAIL, PRIVACY_EFFECTIVE_DATE, SITE_NAME } from "@/lib/site";

/**
 * Privacy policy.
 *
 * This describes v0 EXACTLY as built, and it must be re-read against the binary before
 * every submission. Two things in particular will invalidate it:
 *
 *   1. Adding analytics or crash reporting (§6). v0 ships with neither, and this page says
 *      so plainly. The moment PostHog or Sentry lands, the "What we collect" section is
 *      wrong and so is the Play Data Safety form.
 *   2. Dropping server-side rendering (§7C parachute). If the app ships without render,
 *      the "When you render a video" section describes an upload that never happens and
 *      should be removed.
 */
export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${SITE_NAME} handles your data. Short version: your projects stay on your phone.`,
};

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy"
      lead={`Your projects stay on your phone. Last updated ${PRIVACY_EFFECTIVE_DATE}.`}
    >
      <Section heading="The short version">
        <p>
          {SITE_NAME} has no accounts and no sign-in. Your projects, your pictures, and your
          recordings are stored on your device. We do not collect analytics, we do not track you,
          and we do not sell or share your data with anyone. The one time your media leaves your
          phone is when you ask us to render a video, and it is deleted shortly afterwards.
        </p>
      </Section>

      <Section heading="What we collect">
        <p>
          Nothing. This version of {SITE_NAME} contains no analytics, no advertising identifiers,
          and no crash reporting. We do not have accounts, so we hold no names, email addresses, or
          passwords. We cannot see what you make.
        </p>
        <p>
          If that changes in a future version, this page will be updated before that version is
          released, and the change will be reflected in the app&apos;s store listing.
        </p>
      </Section>

      <Section heading="What stays on your device">
        <p>
          Everything you create. Each project — its script, the photos and videos you add, any
          voiceover you record, and its settings — is written to {SITE_NAME}&apos;s own private
          storage on your phone. Deleting a project deletes those files. Deleting the app deletes
          all of them.
        </p>
        <p>
          When you add a photo or video, {SITE_NAME} copies it into the project rather than linking
          to your library, so editing a project never modifies your camera roll.
        </p>
      </Section>

      <Section heading="When you render a video">
        <p>
          Rendering happens on our servers, because producing a finished video is more work than a
          phone can comfortably do. When you tap Render:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Your project file and the media it uses are uploaded to our render service over an
            encrypted connection.
          </li>
          <li>
            They are used for one purpose only: producing your video. They are not reviewed by a
            person, not used to train anything, and not shared with anyone.
          </li>
          <li>
            Your uploads and the finished video are deleted automatically a short time after the
            render completes — within a few hours at most. We keep no copy.
          </li>
          <li>
            No account is involved, so nothing you upload is linked to an identity. We do not know
            who you are.
          </li>
        </ul>
        <p>
          If you never render, nothing is ever uploaded, and every other part of the app works
          offline.
        </p>
      </Section>

      <Section heading="Permissions the app asks for">
        <p>
          {SITE_NAME} asks for each of these at the moment you first need it, never on launch, and
          each is used only for the stated purpose:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="text-foreground">Photos and videos</strong> — so you can pick
            pictures for your shots. We read only what you choose.
          </li>
          <li>
            <strong className="text-foreground">Microphone</strong> — so you can record a voiceover.
            Recording only happens while you hold or start a recording, and the audio stays in your
            project.
          </li>
          <li>
            <strong className="text-foreground">Saving to your photo library</strong> — so a
            finished video lands in your camera roll.
          </li>
        </ul>
        <p>
          You can decline any of them. The rest of the app keeps working; the feature that needed
          the permission will not.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          {SITE_NAME} is suitable for general audiences. It has no social features, no chat, no
          user-to-user content, and no advertising. We do not knowingly collect personal information
          from anyone, including children, because we do not collect personal information at all.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Because we hold no personal data, there is nothing for us to show you, correct, or delete
          on request. Your data is in your hands: delete a project to remove its files, or delete
          the app to remove everything. If you have rendered a video, that upload has already been
          deleted from our side automatically.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          If this policy changes, the date at the top of this page changes with it. Material changes
          will be described here rather than quietly edited in.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about privacy, or anything else, go to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-moth-green underline underline-offset-4 hover:opacity-80"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </Prose>
  );
}
