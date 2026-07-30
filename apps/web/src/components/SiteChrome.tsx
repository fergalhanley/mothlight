import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import mothIcon from "@/app/assets/mothlight-icon.png";
import { CONTACT_EMAIL, NAV_LINKS, SITE_NAME } from "@/lib/site";

/** The wing spectrum as a hairline. Used to separate the header and footer from content. */
export function SpectrumRule({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`spectrum-rule h-px w-full ${className}`} />;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 text-lg font-semibold tracking-tight"
        >
          <Image
            src={mothIcon}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
            priority
          />
          <span className="transition-colors group-hover:text-white">{SITE_NAME}</span>
        </Link>

        <nav className="flex shrink-0 items-center gap-4 text-sm text-muted sm:gap-5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap transition-colors hover:text-foreground"
            >
              <span className="sm:hidden">{link.short}</span>
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <SpectrumRule className="opacity-70" />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16">
      <SpectrumRule className="opacity-40" />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Image src={mothIcon} alt="" width={20} height={20} className="h-5 w-5 rounded" />
          <p>
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-muted">
              {link.label}
            </Link>
          ))}
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-muted">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Standard wrapper for text-heavy pages: privacy, support, agent docs. */
export function Prose({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {lead ? <p className="mt-3 text-lg text-muted">{lead}</p> : null}
      <div className="mt-10 flex flex-col gap-9 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  );
}
