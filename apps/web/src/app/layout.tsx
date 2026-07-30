import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadata describes what the app actually does today.
 *
 * v0 has no AI generation — it is a short-video editor whose scripts an AI agent can
 * write. Promising generation the binary cannot do would be both untrue and a review risk
 * under the misleading-metadata rules.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — short videos, made on your phone`,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    "Write a script, add your pictures, record a voiceover, and render a short video. No account needed, and your projects stay on your phone.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — short videos, made on your phone`,
    description:
      "Write a script, add your pictures, record a voiceover, and render a short video. No account needed.",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // `dark` is hard-coded: Mothlight ships dark-only for now.
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
