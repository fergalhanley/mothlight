import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT_EMAIL, NAV_LINKS, SITE_NAME } from "@/lib/site";

/** Header and footer shared by every page. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-lg font-semibold tracking-tight hover:text-white">
        {SITE_NAME}
      </Link>

      <nav className="flex items-center gap-4 text-sm text-neutral-400">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-white">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-4xl px-6 py-10 text-sm text-neutral-500">
      <div className="flex flex-col gap-3 border-t border-neutral-800 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-neutral-300">
              {link.label}
            </Link>
          ))}
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-neutral-300">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Standard wrapper for text-heavy pages: privacy, support, docs. */
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {lead ? <p className="mt-3 text-lg text-neutral-400">{lead}</p> : null}
      <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-neutral-300">
        {children}
      </div>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-neutral-100">{heading}</h2>
      {children}
    </section>
  );
}
