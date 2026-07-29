# Handoff: get Mothlight running and verified on iOS

You are picking up an in-flight v0 build. Another agent has been working on this on a Mac
that has **no Xcode** (Command Line Tools only), so iOS has never been built or run. Your
job is to close that gap.

Read `agent/v0-requirements.md` first — it is the spec, and its decision log records why
things are the way they are.

---

## Mission

1. Get the iOS dev client building and running on a simulator, and on a device if you have
   one provisioned.
2. Work the verification checklist below. Most of this app has **never executed anywhere**.
3. Fix what breaks. Report what you find.

You are **not** being asked to build new features. Import/export and the render pipeline
are unstarted and belong to the other agent. If you finish the checklist, stop and report
rather than expanding scope.

---

## Getting started

```bash
git clone git@github.com:fergalhanley/mothlight.git
cd mothlight
bun install                     # Bun 1.3.7+, Node 20+
bun run typecheck && bun run test   # should be clean: 86 tests pass
```

Then:

```bash
cd apps/mobile
bunx expo prebuild --platform ios --clean
bunx expo run:ios
```

Expect the first build to be slow — the Android equivalent took **1h 5m**, mostly
Reanimated and gesture-handler C++. That is normal, not a hang. Check for a live `ninja`
or `clang` process before concluding anything is stuck.

This is a **custom dev client, not Expo Go**. Expo Go cannot load this app.

---

## Constraints — do not change these without saying so loudly

These are all deliberate and were each arrived at the hard way.

| Thing | Why |
|---|---|
| **TypeScript pinned to `6.0.3`** | TS 7 is current stable but Next 16 rejects its compiler API, and Expo SDK 57 pins `~6.0.3`. Do not "upgrade" it. |
| **`bunfig.toml` sets `linker = "hoisted"`** | Bun 1.3 defaults to an isolated pnpm-style layout that installs multiple physical copies of native modules. React Native allows exactly one, and `expo-doctor` fails on it. |
| **React pinned to `19.2.3` via root `overrides`** | Expo 57's pin. Next's template wanted 19.2.4, which produced a second copy of React. Note: no comment keys inside `overrides` — npm rejects them and it breaks `expo-doctor`. |
| **Bundle ID is `app.mothlight`** | Locked before first submission (decision 4). One universal ID across iPhone, iPad, Play, and Samsung. Changing it after release is impossible. |
| **`apps/mobile/src/lib/auth/` is dormant, not dead** | v0 ships with no accounts. That directory is kept, working, for v1 — including the Apple provider that guideline 4.8 makes mandatory. Read its README. Do not delete it, and do not wire it up. |
| **Effects and SFX rows are deliberately absent** | §8 cuts them. The schema keeps the fields so v0.1 needs no migration, but a disabled "coming soon" row reads as an unfinished app to a reviewer. Do not add them. |
| **`ios/` and `android/` are git-ignored** | They are prebuild output. Do not commit them. |

`apps/mobile/app.config.ts` already carries every permission purpose string from §3. If
iOS needs a string that is missing, add it **there**, not in a raw Info.plist — prebuild
regenerates that.

---

## What is actually built

| Area | State |
|---|---|
| `packages/core` — project.json schema, validation, durations, captions, autosave | Done, 80 tests |
| Local persistence — atomic writes, asset copy-in, prefs | Done |
| Dashboard — search, swipe-delete + UNDO, context menu, empty state | Done |
| Demo project seeded on first launch | Done, but **uses solid-colour visuals** — no bundled media exists yet |
| Editor — accordion, script/visual/audio tracks | Done |
| Preview canvas — single-clock playback, captions, overlays | Done |
| Import/export, render, instrumentation, store prep | **Not started** |

On Android, the app builds, launches, and the dashboard renders correctly with the seeded
demo showing `0:20 · 4 segments · just now`. That proved the storage → schema → formatting
chain works. **Nothing past first render has ever been exercised on any platform**, because
the Android emulator's `system_server` ANR'd and then crashed under host load.

---

## Verification checklist

Priority order. P0 items are code paths no human or machine has ever run.

### P0 — core flows, never executed

1. **Editor accordion.** Tap a segment card — it expands inline, and expanding a second
   collapses the first. Expanding should seek the preview to that segment's start.
2. **Script + autosave.** Type into a segment's script. Navigate back to the dashboard.
   Reopen. The text must still be there. There is **no Save button anywhere** — autosave is
   debounced 500ms and flushed on back-navigation and on backgrounding. This is the single
   highest-consequence path in the app.
3. **Force-quit durability.** Edit a script, then force-quit the app *within* the debounce
   window, and again a few seconds after. Relaunch. Verify no data loss and — critically —
   no corrupt `project.json`. Writes go through a temp file + rename for exactly this.
4. **Photo library picker.** Add a visual. The permission sheet must show:
   *"Mothlight needs access to your photos and videos so you can use them in your projects."*
   Pick a large HEIC. It should be copied into the project sandbox, downscaled to 2160px on
   the long edge, and re-encoded to JPEG. Confirm the file lands in
   `Documents/projects/<id>/assets/` and the thumbnail renders.
5. **Voiceover recording.** Record in a segment. Permission string must read:
   *"Mothlight uses the microphone to record voiceovers for your videos."* Stop, then play
   back. Then check the segment's duration updated — auto mode stretches to fit the VO.
   `expo-audio`'s recorder API is the piece I had least confidence in; watch it closely.
6. **Preview playback.** Tap the canvas. Captions should appear and advance through the
   script; overlays should appear at their positions. It does not need to be frame-perfect
   — it needs to be honest about order, timing, and content.
7. **Swipe-to-delete + UNDO.** Swipe a dashboard row either way. It leaves immediately and
   a snackbar appears. UNDO restores it. Let a second one expire — the project directory
   should be gone. Then: swipe, and background the app *during* the 5s window. The delete
   must commit rather than resurrect on relaunch.
8. **Demo seeding is once-only.** Delete the demo. You should reach the empty state.
   Relaunch. It must **not** come back.
9. **Segment actions.** Move up/down, duplicate, delete. Duplicating should give the copy
   new overlay ids but share the same asset files.

### P1 — iOS specifics

10. **Safe areas** on a notched/Dynamic Island device — top bar and the bottom of the
    segment list.
11. **Keyboard avoidance** in the editor while typing a script in the last segment.
12. **Files app import** as a visual source (the non-photo-library path).
13. **Permission strings** actually present in the generated Info.plist, and no *extra*
    permissions declared that we do not use — `expo-image-picker` is configured with camera
    and microphone explicitly disabled, and unused permissions invite review questions.

---

## Known traps

- **`resolveAssetUri`** turns the relative `assets/<id>.jpg` stored in project.json into an
  absolute `file://` URI. If images render on Android but not iOS, look there first.
- **SecureStore's 2048-byte limit** is documented in the dormant auth code. Irrelevant to
  v0, but do not "fix" it.
- The **overlay centering** in `PreviewCanvas.tsx` uses a fixed-width + `translateX` trick
  to centre text on a point without measuring. If overlays sit wrong on iOS, that is the
  suspect.
- **`expo-file-system` v57** uses the object API (`File`, `Directory`, `Paths`), not the
  legacy functional one. Verified working on Android.

---

## Reporting back

Please report:

- Which checklist items pass, fail, or are blocked — explicitly, including the ones you did
  not get to.
- Any redbox or native crash, with the logs.
- Any place an API behaved differently on iOS than the Android-verified behaviour,
  particularly in `expo-audio`, `expo-image-picker`, or `expo-file-system`.
- Anything you changed, and why.

Commit in small, clearly-messaged pieces and push to `main`. If you need to make a call
that contradicts anything in this document or in `agent/v0-requirements.md`, say so
prominently rather than burying it in a commit.

---

## Context you may want

- Today is **29 Jul**. Target is store submission by **Fri 31 Jul**, manual/held release on
  or after 1 Aug.
- The render path (§7) is decided as **server-side Remotion on a Fly/Railway container**
  (decision 7) but is **not built**. There is a Wednesday EOD gate on it, with §7C — ship
  with no MP4 export — as the parachute.
- Two things are still blocked on Fergal: the **ElevenLabs licence check** for bundled
  music, and the **analytics vendor** choice. The demo project has no audio at all until
  the first is resolved.
