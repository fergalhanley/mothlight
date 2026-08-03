# iOS verification report

Answers `agent/ios-handoff.md`. Mothlight now builds, installs, launches and runs on iOS.

**Environment:** Xcode 26.3 (Swift 6.2.4), iOS 26.3 simulator (iPhone 17 Pro), on an
**Intel** Mac (i9-9880H, macOS 15.7.7). The handoff assumed no Xcode; this machine has it,
but being Intel is worth knowing — the installed binary is x86_64.

**Not covered:** import/export, render, instrumentation, store prep. Still the other
agent's scope, per the handoff.

---

## Getting it to build

Two blockers, neither in our code. Full detail in the commit messages.

**1. CocoaPods was running on macOS system Ruby 2.6.** Expo's precompiled-module resolver
uses `filter_map` (Ruby 2.7+), so it threw once per module and *silently* fell back to
building every Expo module from Swift source. That fallback is what exposed
[expo/expo#47539](https://github.com/expo/expo/issues/47539) — `sending 'emitter' risks
causing data races` in `expo-modules-core`. The Swift errors were a symptom, not the
cause. `brew install ruby` + `gem install cocoapods` fixes it: `ExpoModulesCore` then
arrives as a prebuilt xcframework and the offending file is never compiled. Documented in
the README, because system Ruby fails silently and the error surfaces thousands of lines
later looking unrelated.

Worth stating plainly: this is **not** fixed by upgrading to Xcode 26.4 / Swift 6.3.
That upgrade would also have required moving this Mac from macOS 15.7.7 to Tahoe 26.2+
first, since [Xcode 26.4 requires it](https://developer.apple.com/documentation/xcode-release-notes/xcode-26_4-release-notes).

**2. `expo-modules-jsi` does not type-check under Swift 6.2.4.** `abs(milliseconds)` in
`JavaScriptCodable+Date.swift` — "type of expression is ambiguous". This module always
builds from source (it is not in the precompiled set), so it cannot be dodged. Fixed with
a one-line, behaviour-preserving patch (`.magnitude`), now committed as
`patches/expo-modules-jsi@57.0.4.patch`. Both packages are at their latest published
version; there is nothing to upgrade into. Both are worth reporting upstream.

---

## Checklist

### P0

| # | Item | Result |
|---|---|---|
| 1 | Editor accordion | **Pass** |
| 2 | Script + autosave | **Pass** |
| 3 | Force-quit durability | **Pass** (one nuance below) |
| 4 | Photo library picker | **Pass** |
| 5 | Voiceover recording | **Pass** — but only after a permission fix |
| 6 | Preview playback | **Pass** |
| 7 | Swipe-delete + UNDO | **Pass** |
| 8 | Demo seeding once-only | **Pass** |
| 9 | Segment actions | **Pass** |

**1. Accordion.** Tapping a card expands it inline; expanding another collapses the first.
The seek works: transport went `0:00` → `0:05` on expanding segment 2, back to `0:00` on
segment 1, and later to `0:35` for a segment whose predecessor had been stretched by a
voiceover — so it seeks to the *resolved* start, not a nominal one.

**2. Script + autosave.** Typed a marker, confirmed the 500 ms debounce wrote it to
`project.json` on disk, navigated back, reopened — text intact. The highest-consequence
path in the app works.

**3. Force-quit durability.** `project.json` stayed valid JSON in every scenario, and no
`.project.json.tmp` was ever left behind — the temp-file-plus-rename does its job.
Backgrounding flushes correctly: after HOME the edit was on disk *before* the kill.

The nuance: a `SIGKILL` with no backgrounding first loses edits still inside the 500 ms
window. That is inherent to a debounce, and it is **not reachable by the normal iOS
force-quit gesture** — swiping to the app switcher backgrounds the app, which fires the
flush, before the user can swipe it away. I only produced it with `simctl terminate`,
which is harsher than anything a user can do. No action needed.

**4. Photo library.** Permission sheet reads exactly *"Mothlight needs access to your
photos and videos so you can use them in your projects."* Picked a 4032×3024 HEIC; it
landed at `Documents/projects/<id>/assets/asset_*.jpg` as a genuine JPEG, **2160×1620** —
downscaled to 2160 on the long edge with aspect preserved, and re-encoded from HEIC.
`originalFilename` correctly records `big.heic`. Thumbnail renders in the canvas, the
segment card and the visual track.

**5. Voiceover.** Permission sheet reads exactly *"Mothlight uses the microphone to record
voiceovers for your videos."* Recorded 35 s → saved as `.m4a` in the project sandbox with
`durationMs: 35420`, `vo` wired to the segment, and the header updated to `0:35 · 1
segment` — auto mode stretched the segment to fit. Playback did not crash. `expo-audio`'s
recorder, the API the handoff trusted least, behaved correctly.

This item **could not have passed before this session** — see the permission bug below.

**6. Preview playback.** Captions appear and advance ("This is Mothlight. Short" at `0:00`
→ "videos, made on your" at `0:02`). The text overlay renders centred at its anchor.
Playback stops at the end rather than looping. Honest about order, timing and content.

**7. Swipe-delete + UNDO.** Both swipe directions are offered. The row leaves immediately,
snackbar appears, UNDO restores it (directory never touched). Letting it expire commits —
directory gone. And the critical case: backgrounding *during* the 5 s window committed the
delete immediately, and it did **not** resurrect on relaunch.

**8. Demo seeding.** After deleting the demo, `hasSeededDemo: true` persisted and
`lastOpenedAt` was cleaned up. Relaunch → empty state, demo did not come back.

**9. Segment actions.** Move up/down obey boundaries (segment 1 offers only "Move down";
a middle segment offers both). Duplicate inserts after its source with a **new segment id
and new overlay ids** while preserving text — exactly as specified. Delete works. Project
restored to its original 4 segments in order.

### P1

| # | Item | Result |
|---|---|---|
| 10 | Safe areas | **Pass** |
| 11 | Keyboard avoidance | **Not verified** |
| 12 | Files app import | **Not tested** |
| 13 | Permission strings | **Pass** |

**10.** Top bar clears the Dynamic Island; the bottom of the segment list clears the home
indicator (`SafeAreaView` omits the bottom edge, but the list's `paddingBottom: 64`
covers it).

**11. Not verified.** The simulator had "Connect Hardware Keyboard" enabled, so the
software keyboard never appears and `KeyboardAvoidingView` has nothing to avoid. Needs
⌘⇧K or a physical device. **Still outstanding.**

**12. Not tested.** Ran out of scope before the Files path. The "Files" button is present
and wired to `pickVisualFromFiles`. **Still outstanding.**

**13.** Verified on the *installed binary*, not just prebuild output:

```
NSMicrophoneUsageDescription     "Mothlight uses the microphone to record voiceovers…"
NSPhotoLibraryUsageDescription   "Mothlight needs access to your photos and videos…"
NSPhotoLibraryAddUsageDescription "Mothlight saves finished videos to your photo library."
```

No `NSCameraUsageDescription`, no `NSFaceIDUsageDescription`, no `UIBackgroundModes`. The
only extra is `NSLocalNetworkUsageDescription`, which is expo-dev-client's and is stripped
in Release by its own build phase.

---

## Known traps — all four cleared

- **`resolveAssetUri`** — works on iOS. The picked image renders everywhere. Storing
  relative paths is right, since the iOS container UUID changes between installs.
- **Overlay centering** (`width: 2000` + `translateX(-1000)`) — renders correctly centred
  on its anchor. Not a problem.
- **`expo-file-system` v57 object API** — `create`/`write`/`moveSync` all behave.
- **`expo-audio` recorder** — see item 5.

---

## What I changed

1. **`fix(mobile)`: microphone permission.** `expo-image-picker` was configured with
   `microphonePermission: false` next to `cameraPermission: false`. Camera is genuinely
   unused; the microphone is not. Both plugins write the *same* Info.plist key, and `false`
   means *delete it*, so image-picker was removing what `expo-audio` had just written.
   Verified on both generated projects:
   - iOS: `NSMicrophoneUsageDescription` absent → TCC kill the instant recording starts
   - Android: `RECORD_AUDIO` emitted as `tools:node="remove"` → merger strips it

   So **P0 item 5 was broken on both platforms**, including the Android build that was
   considered working. It survived because nothing past first render had ever run.
   Also removed two unused capabilities (`NSFaceIDUsageDescription`, the `audio`
   `UIBackgroundMode`) — §3's table specifies neither.

2. **`build(mobile)`: `expo-modules-jsi` patch** — above.
3. **`docs`: README Ruby requirement** — above.
4. **`chore`: lockfile** — reanimated/gesture-handler/worklets were in `package.json` but
   never recorded in `bun.lock`.

Nothing in `app/`, `src/` or `packages/` was changed. No product code needed fixing.

---

## Things I found but did not change

Flagged rather than fixed, because they are judgement calls that belong to you.

1. **The demo tells a reviewer to tap a button that does not exist.** Segment 4 reads
   *"Then render it, and it lands in your camera roll. Tap Render to try it"* with a
   **"Tap Render"** overlay. Render is unbuilt. This is the first thing an App Review
   tester sees, and §2.1 functional-completeness is exactly what gets apps rejected. If
   §7C (ship with no MP4 export) is taken, this copy **must** change.

2. **Dead controls.** Dashboard "Rename" and "Export project" both just open the editor.
   The editor's `⋯` project menu (`app/project/[id].tsx:178`) and the soundtrack row
   (`:185`) have no `onPress` at all — they look tappable and do nothing. All four are
   reviewer-facing.

3. **`expandedSegmentId` is written but never read.** `setExpandedSegmentId` persists it
   via `setEditorState`, and `prefs.ts` documents it as "so relaunch lands where the user
   left off" — but nothing reads `lastEditor` back on load. Confirmed at runtime: reopening
   a project always starts collapsed. Harmless, but it is dead persistence, so either wire
   it up or drop the field.

---

## Reproducing

```bash
brew install ruby && export PATH="/usr/local/opt/ruby/bin:$PATH"
gem install cocoapods && export PATH="$(gem environment gemdir)/bin:$PATH"
bun install                                    # applies patches/
cd apps/mobile
bunx expo prebuild --platform ios --clean
bunx expo run:ios
```

The build took ~12 minutes, not the hour the Android build did — RN core and most Expo
modules come prebuilt.

UI automation used `idb` (`brew install facebook/fb/idb-companion`, `pip install fb-idb`).
AppleScript is not an option: clicking needs Accessibility permission, which is not
granted. `idb ui describe-all` gives the accessibility tree, which is far more reliable
than guessing coordinates — but note it reports full scroll-content coordinates while taps
need on-screen ones, so anything below y≈874 must be scrolled into view first.
