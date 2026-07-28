import Link from "next/link";

export const metadata = {
  title: "Sign-in failed — Mothlight",
};

export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">We couldn&apos;t complete that sign-in</h1>
      <p className="max-w-prose text-sm text-neutral-400">
        The sign-in link was missing or has already been used. Please try again.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4 hover:text-white">
        Back to home
      </Link>
    </main>
  );
}
