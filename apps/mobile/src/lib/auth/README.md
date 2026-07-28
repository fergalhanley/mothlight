# Dormant — Supabase auth

**Nothing in this directory is imported by the v0 app.** It is kept, wired and working,
so v1 can revive accounts without rebuilding them.

v0 ships with no accounts at all: no sign-in wall, no backend on the critical path, and
no App Store 5.1.1(v) exposure. Projects live only on the device.

## Why it is still here

The monorepo boilerplate arrived with email/password, Google, Facebook, and Apple sign-in
already wired against Supabase. Deleting it would mean rebuilding it — including the
Apple provider that App Store guideline 4.8 makes mandatory once Google and Facebook are
offered. The Supabase project, the `profiles` table, and its RLS policies are all still
in the repo under `supabase/`.

## Waking it up

1. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see
   `apps/mobile/.env.example`).
2. Mount `SessionProvider` from `./session` in `app/_layout.tsx`.
3. Add an `(auth)` route group and gate it with `Stack.Protected`, as the boilerplate
   did before v0 removed it — see git history for `feat(mobile): expo dev-client app
   with expo-router auth flow`.
4. Work through the provider checklist in the root README.

Everything here reads its configuration lazily, so importing a file by accident cannot
crash an app that has no Supabase environment set.
