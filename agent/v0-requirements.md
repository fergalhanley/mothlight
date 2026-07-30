# Mothlight — v0.0 Requirements

**Goal:** smallest complete app that survives App Review and lets someone make a short-form
video on their phone. No AI generation. No RevenueCat. No accounts.

**Target:** submit to all three stores by Fri 31 Jul; **manual/held release** on or after 1 Aug.
Samsung Galaxy Store is likely to be live first (no closed-testing requirement) and is an
eligible Shipaton store this year.

---

## 0. Framing decisions (locked before build)

| Decision | v0 answer | Why |
|---|---|---|
| Platforms | **Android-first** (Google Play + Samsung Galaxy Store), iOS/iPadOS in parallel | Android is the design reference for interaction patterns; Samsung is the fastest route to a live in-window release. |
| Identity | Bundle ID / applicationId **`app.mothlight`** — one universal ID across iPhone, iPad, and both Android stores | Reverse-DNS of `mothlight.app`. Universal apps need one ID; separate iPad IDs mean separate listings forever. |
| Auth | **None.** Local-only, no sign-in wall. | Removes backend from critical path; avoids App Store 5.1.1(v) friction. Supabase auth stays in the repo, dormant. |
| Storage | Local device only (SQLite/MMKV + app sandbox files) | No sync, no upload, no accounts. Instant, offline, cheap. |
| Canvas | Fixed **1080×1920, 30fps, H.264/AAC, MP4** | One aspect ratio to design and render for. Others are v0.2. |
| Max length | Soft cap **90s**, hard cap 180s | Keeps render times and memory sane. |
| Render | **Server-side, confirmed** (§7), with a Wednesday fallback gate | On-device FFmpeg in RN is a maintenance hazard in 2026. |
| Shot model | Timeline is an ordered list of **shots**; everything is scoped to a shot except the soundtrack | Matches the mental model of a scripted short. |

---

## 1. Data model — `project.json`

This is the **import/export format** and the target for the agent script-writing skill.
Version it from day one. Validate with zod on import; reject with a readable error.

**Wire compatibility:** the user-facing term is **shot** everywhere. The schema retains the
legacy `segments` array key in v0.1 so existing project files continue to import; it is an
implementation detail and must not appear as product copy.

```jsonc
{
  "schemaVersion": "0.1",
  "id": "uuid",
  "name": "Why moths chase light",
  "createdAt": "2026-07-28T04:00:00Z",
  "updatedAt": "2026-07-28T04:00:00Z",
  "canvas": { "width": 1080, "height": 1920, "fps": 30 },

  "captionStyle": {
    "enabled": true,              // project-level default
    "font": "Inter-Bold",
    "sizePt": 48,
    "color": "#FFFFFF",
    "strokeColor": "#000000",
    "position": "lower-third",    // upper-third | center | lower-third
    "wordsPerCue": 4
  },

  "soundtrack": {
    "assetId": "asset_music_1",   // null = none
    "gainDb": -18,
    "duckUnderVo": true,
    "fadeOutMs": 1500
  },

  "segments": [
    {
      "id": "seg_1",
      "durationMode": "auto",     // auto | manual
      "durationMs": 4200,         // computed when auto, authoritative when manual
      "script": "Moths don't love light. They're lost.",
      "captionsEnabled": true,    // per-shot override of captionStyle.enabled

      "visual": {
        "main": {
          "type": "image",        // image | video | color
          "assetId": "asset_1",
          "fit": "cover",
          "color": null,          // used when type === "color"
          "trimStartMs": 0,       // video only
          "trimEndMs": null,      // video only
          "muteSourceAudio": true,
          "kenBurns": { "enabled": true, "from": "center", "to": "zoom-in" }
        },
        "overlays": [
          {
            "id": "ov_1",
            "type": "text",       // text | image | drawing
            "text": "1963",
            "x": 0.5, "y": 0.2,   // normalised 0–1, anchor = centre
            "scale": 1.0,
            "rotation": 0,
            "style": { "font": "Inter-Bold", "sizePt": 64, "color": "#FFCC00" },
            "startMs": 0,
            "endMs": null         // null = to end of shot
          }
        ],
        "effects": []             // reserved — not rendered in v0
      },

      "audio": {
        "vo": { "assetId": "asset_vo_1", "gainDb": 0, "trimStartMs": 0 },
        "sfx": []                 // reserved — not rendered in v0
      }
    }
  ],

  "assets": [
    {
      "id": "asset_1",
      "kind": "image",            // image | video | audio
      "uri": "assets/asset_1.jpg",// relative to project dir; absolute after import
      "source": "photo-library",  // photo-library | files | recording | bundled
      "originalFilename": "IMG_0421.HEIC",
      "durationMs": null,
      "width": 4032, "height": 3024
    }
  ]
}
```

**Duration rules (`durationMode: "auto"`):**
`durationMs = max(voDurationMs, videoClipDurationMs, 3000)` — 3s default for a still with no VO.
Manual mode: user-set, but never shorter than the VO.

**Import behaviour:** a `.json` with no `assets` (i.e. an agent-generated script) is valid.
Shots then have `script` + empty visuals, and the editor shows them as "needs a visual"
placeholders. **This is the intended agent workflow** — the agent writes structure and words;
the human adds pictures.

---

## 2. Screens

### 2.1 Splash / load
- Brand mark, single accent animation, ≤1.2s perceived.
- Warms local DB, migrates schema if needed, seeds the demo project on **first launch only**.
- **Seed a real demo project** ("Mothlight — 30 second tour"): 4 shots, bundled images,
  bundled VO, bundled music, captions on. This is the single highest-value item in v0 —
  it's what the App Review tester opens, and what a new user learns from.

### 2.2 Dashboard
- Header: wordmark left, `+` (new project) right.
- Search field: filters by project name and script content, debounced, case-insensitive.
- List: newest-**last-opened** first. Each row: 9:16 thumbnail (first shot's visual or
  placeholder), name, duration, shot count, relative modified time.
- Tap row → editor.
- **Swipe to dismiss → optimistic delete + snackbar** ("Project deleted — UNDO"), Material
  convention, used on both platforms. Row animates out immediately; keep the record in memory
  for 5s; UNDO restores it in place; snackbar expiry (or app backgrounding) commits the hard
  delete of the project directory. No confirm dialog.
- Long-press row → context menu: Rename, Duplicate, Export project, Delete.
- Overflow (header) → Import project… , Settings, About / Get the agent skill.
- **Empty state** (only reachable after deleting the demo): illustration + "Create your first
  project" + "Import a script".

### 2.3 Import
- Entry points: dashboard overflow → Import; **OS share sheet** (register `.json` /
  `public.json` as an accepted document type); **file open** from Files app.
- Validate against schema → on success, create project and open it; on failure, show a
  non-scary error naming the first problem ("Shot 3 has no `script` or `visual`").
- Include a **"Get the agent skill"** screen: a short explanation + a copyable prompt/schema
  block + a link to the docs page on the marketing site. Zero build cost, big differentiator.

### 2.4 Editor

Layout, top to bottom:

```
┌─────────────────────────────────────┐
│ ‹   Moths chase light   0:42 · 6 ⋯  │  top bar
├─────────────────────────────────────┤
│ [ ▶ Preview ]       [ 🚀 Render ]   │  primary actions
├─────────────────────────────────────┤
│ ♪ Soundtrack: Dust Motes      ⌄     │  project-level row
├─────────────────────────────────────┤
│ ┌─ SHOT 1 ─────────────── 4.2s ─┐   │
│ │ [thumb] "Moths don't love…"   │   │  collapsed shot card
│ │ 🎙 ✓  💬 ✓                     │   │
│ └───────────────────────────────┘   │  vertical scroll
│ ┌─ SHOT 2 ─────────────── 3.0s ─┐   │
│ │ …                             │   │
│ └───────────────────────────────┘   │
│                                     │
│         [ + Add shot ]           │
└─────────────────────────────────────┘
```

**Top bar:** back (‹) → dashboard (autosaves first); centre shows project name (tap to
rename inline) with total duration + shot count beneath; right is the ⋯ overflow menu.

**Tapping a shot card** expands it **inline, as an accordion** (decided — not a pushed
full-screen editor), revealing three collapsible tracks. Only one shot is expanded at a
time; expanding another collapses the previous and seeks playback to that shot's start.

**Preview:** Preview opens a full-screen player with working play/pause and scrubbing.
The user may switch it to a draggable, free-floating player above the editor so changes and
playback can be checked together without permanently consuming editor space. Render sits
immediately to the right of Preview and uses a rocket icon. Video shots show moving frames,
and soundtrack + voiceover are driven from the same clock.

**Track: Script**
- Multiline text input, autogrows.
- 🎙 button → OS dictation (`expo-speech-recognition` or the native keyboard dictation key —
  keyboard dictation is free and needs no permission plumbing; prefer it for v0).
- Captions toggle (per shot), with style inherited from project.

**Track: Visual**
- *Main* row: thumbnail + "Choose image or video" → photo library / Files / solid colour.
  Once set: Replace, Trim (video only, simple two-handle trim), Ken Burns toggle (stills),
  Remove.
- *Overlays* row: list of overlay chips + `+ Text` and `+ Draw`.
  - Text overlay editor: type text, drag to position on a canvas-preview, pinch to scale,
    colour swatches, font size slider.
  - **Drawing: see §8 cut list.** If included: freehand path capture on the canvas preview,
    stroke colour + width, per-stroke undo, saved as a transparent PNG asset.
- *Effects* row: **not shown in v0.**

**Track: Audio**
- *Voiceover* row: Record (hold-to-record or tap-start/tap-stop, waveform while recording),
  playback, re-record, delete, gain slider. Or import an audio file.
- *SFX* row: **not shown in v0.**
- Background music is **project-level** (the row above the shot list), not per-shot.
  This deviates from the original spec deliberately: per-shot background music is not a
  thing users want, and it complicates crossfades. Per-shot override is v0.2 if anyone asks.

**Shot actions** (long-press card or ⋯ on the card): Move up, Move down, Duplicate, Delete.
Drag-to-reorder is v0.1 — move up/down is 20 minutes of work and covers the need.

**Preview playback:** real-time composition play in-app — layered `expo-video`/`Image` +
overlay views + `expo-audio` for VO/music, driven by a single clock. It does **not** need to
be frame-perfect; it needs to be honest about order, timing, and content.

### 2.5 Overflow menu (editor)
- Rename project
- Export script (`.md` — shot headings + script text, via OS share sheet)
- Export timeline (**FCP7 XML**, via OS share sheet — see §8, candidate cut)
- Export project (`.json` — the schema above, media referenced not embedded)
- **Render video** → §7
- Delete project

---

## 3. Permissions (each needs a purpose string — missing strings = instant rejection)

| Permission | When asked | Purpose string (draft) |
|---|---|---|
| Photo library (read) | First time adding a visual | "Mothlight needs access to your photos and videos so you can use them in your projects." |
| Photo library (add) | First successful render | "Mothlight saves finished videos to your photo library." |
| Microphone | First VO record | "Mothlight uses the microphone to record voiceovers for your videos." |
| Speech recognition | Only if using in-app dictation | "Mothlight converts your speech to text so you can dictate scripts." |

Request **in context, at point of use** — never a permission wall on launch.

---

## 4. Media handling

- On selection, **copy** the asset into the project's sandbox directory
  (`Documents/projects/<id>/assets/`). Never hold a photo-library reference — assets get
  deleted, moved, or re-encoded by the OS and your project silently breaks.
- Downscale stills to max 2160px on the long edge on import (memory + render time).
- Show a progress indicator for imports > 500ms.
- Delete the project directory when the project is deleted.
- Bundled music: 3–5 beds, **generated on ElevenLabs** (Fergal to supply during dev), kept
  deliberately limited in v0. User-generated soundtracks are a v1 feature and a natural
  RevenueCat-metered one.
  - **Blocking check:** confirm the ElevenLabs plan tier grants commercial use *and*
    redistribution inside a distributed application. Keep a written record of the licence
    basis in `assets/music/LICENCE.md` alongside the files. If there's any ambiguity, swap in
    a CC0 pack — three background beds are not worth a takedown.
  - Loop-friendly, ~60–90s each, -18 LUFS-ish, named descriptively (mood, not track number).

---

## 5. Persistence & safety

- Autosave on every mutation, debounced 500ms. No "Save" button anywhere.
- Write to a temp file then atomically rename — never leave a half-written project.json.
- Restore last editor state on relaunch (which project, which shot expanded).
- Schema migration hook in place (even though there's nothing to migrate yet).

---

## 6. Instrumentation (in v0 — the growth graph starts at launch)

- **Analytics** (PostHog or Mixpanel): app_open, project_created, project_imported,
  shot_added, visual_added, vo_recorded, captions_enabled, render_started,
  render_completed, render_failed, export_xml, export_script, share_completed.
- **Crash reporting** (Sentry) with source maps.
- **EAS Update** configured with a `production` channel — JS-only fixes ship without review,
  which is what makes weekly iteration actually weekly.

---

## 7. Render — the one genuinely risky item

On-device FFmpeg in React Native is a bad bet in 2026: FFmpegKit was retired in 2025 and its
binaries pulled; the RN ecosystem has no clear successor, only community forks with low
download counts. Three viable paths:

**A. Server-side render — DECIDED for v0.**
Upload the project + assets → job queue → Remotion render on a worker → signed URL back →
app downloads and saves to Photos.
- *Pros:* uses the Remotion pipeline you already have; puts the backend in production early,
  which every v1 AI feature needs anyway; render quality/consistency is fully controlled.
- *Cons:* requires network; upload of user media (cap at ~150MB/project for v0); infra + cost;
  needs a job status UI and ideally a push notification.
- *v0 simplification:* poll for status while the app is foregrounded, show a progress screen,
  allow backgrounding with a local notification on completion.

**B. Native composition module (too big for Friday — but closer than it was).**
Android `Media3 Transformer` does multi-asset composition, overlays, effects *and* hardware
encode in one library; iOS needs `AVMutableComposition` + `AVVideoComposition` separately.
Because Android is the reference platform, this is now a realistic **v0.1/v0.2** target on
Android alone — offline, instant, zero marginal cost — while iOS stays on path A until it
earns the AVFoundation work. Don't start it this week; do design the render interface so the
app doesn't care which engine answers.

**C. Ship v0.0 with no MP4 export.** Preview + script export + XML export only.
- *Risk:* App Review guideline 4.2 (minimum functionality) — a video app that can't output a
  video invites a "this feels incomplete" rejection, and it weakens the demo badly.
- Use only as a Thursday-night emergency parachute, and if used, make the XML + script exports
  visibly excellent so the app reads as a *pre-production tool*, not a broken editor.

**Decision gate: Wednesday EOD.** If path A isn't producing an MP4 end-to-end by then, fall
back to C, submit, and land render as the v0.1 update in week one.

Render output: 1080×1920, H.264 High, 30fps, ~8–10 Mbps, AAC 128kbps stereo, faststart.
Save to Photos, then offer the OS share sheet immediately.

---

## 8. Cut list (do these only if the critical path is clear)

| Item | Call |
|---|---|
| Drawing markup | **Cut to v0.1.** Text overlays cover 80% of the need at 20% of the cost. Gesture canvas + undo + serialisation is a day you don't have. |
| FCP7 XML export | **Keep if Wednesday looks good, else v0.1.** Note the media-path problem: XML references files by path, so export must either write a folder alongside the XML or document that the user copies media manually. Test the output actually opens in Resolve before shipping it. |
| Video/audio "effects" sub-tracks | **Cut.** Keep the schema fields, don't render the UI. Disabled/"coming soon" rows read as incomplete to reviewers. |
| Drag-to-reorder shots | Cut — move up/down instead. |
| Undo/redo | Cut. Destructive actions get confirmations instead. |
| Per-shot background music | Cut — project-level soundtrack only. |
| Voice-to-text in-app | Use the **keyboard dictation key** (free, no permission, no library). Custom speech recognition is v0.1. |

---

## 9. Store submission checklist

**Blocking, and mostly not code:**
- [ ] Bundle ID / applicationId locked as **`app.mothlight`** everywhere before first submission
- [ ] Upload keystore generated and backed up somewhere that isn't one laptop
- [ ] **Samsung Galaxy Store** — Samsung developer account + Seller Portal registration; same
      AAB/APK, no closed-testing requirement, review in days. **Most likely to be live first;
      treat it as the primary route to an in-window public release.**
- [ ] Google Play: production access confirmed — **if this is a new personal account, the
      ~12-tester / 14-day closed-test requirement means Play production is mid-August at
      best.** Start the closed track today; recruit testers in the Shipaton Discord (offer
      reciprocal testing — everyone there has the same problem).
- [ ] Play: confirm the current required `targetSdk` before building — Google raises the
      floor annually around the end of August, and it applies to new submissions.
- [ ] Note: Play App Signing re-signs with Google's key while Samsung ships yours, so the same
      package installed from different stores can't cross-update. Expected, not a bug.
- [ ] Apple Developer membership active; App Store Connect app record created; universal
      (iPhone + iPad) device family on the single bundle ID
- [x] **Privacy policy + support + marketing pages built** (`apps/web`: `/`, `/privacy`,
      `/support`, `/agent`). All static, verified serving with no environment set.
      **Still to do: deploy them and point mothlight.app at it** — the URLs are what the
      listings need, and an unbuilt page and an undeployed one block equally.
- [ ] Privacy nutrition label / Play Data Safety form (per decision 10 v0 collects NOTHING;
      media never leaves the device unless path A render is enabled — if it is, disclose it)
- [ ] Age rating questionnaire (4+ / Everyone is achievable for v0 with no UGC sharing)
- [ ] App icon 1024×1024, no alpha
- [ ] Screenshots: Play (phone + 7"/10" tablet), Samsung, and 6.7"/6.5" iPhone; generate them
      all from the demo project in one pass
- [ ] Play feature graphic (1024×500) and short/full descriptions
- [ ] Name + subtitle + keywords: `Mothlight` / subtitle carrying the ASO terms
- [ ] **"Manually release this version"** selected — do not let it publish before 1 Aug
- [ ] Demo account note in Review Notes: "No account required. A demo project is pre-loaded
      on first launch — open it and tap Render to see the full flow."
- [ ] Export compliance: uses only standard encryption (HTTPS) → declare accordingly

---

## 10. Definition of done for v0.0

A person who has never seen the app can, in under five minutes, on a phone, with no account:

1. Open it, see a demo project, and understand what the app is.
2. Create a new project, add three shots, write a line of script into each.
3. Add a photo to each shot and record a voiceover for one.
4. Turn on captions, pick a soundtrack.
5. Play it back and see something that looks like a short-form video.
6. Render it, find it in their camera roll, and post it to TikTok from there.

If any of those six break, that's the bug queue. Everything else is v0.1.

---

## 11. Decision log

| # | Decision | Resolution | Date |
|---|---|---|---|
| 1 | Render path | **A — server-side.** Wednesday EOD gate; fall back to §7C if no end-to-end MP4 by then. Android native render (Media3) becomes a v0.1/v0.2 target. | 28 Jul |
| 2 | Delete interaction | **Android convention** — swipe-to-dismiss + optimistic delete + UNDO snackbar, on both platforms. No confirm dialog. | 28 Jul |
| 3 | Shot expansion | **Inline accordion**, one open at a time; preview is full-screen or a draggable floating player. | 29 Jul |
| 4 | Identity | `mothlight.app` acquired → **`app.mothlight`**, one universal ID across iPhone, iPad, Play, and Samsung. No separate iPad ID. | 28 Jul |
| 5 | Bundled music | **ElevenLabs-generated**, 3–5 beds, supplied during dev. Commercial + redistribution rights to be confirmed and recorded in-repo. User-generated music deferred to v1. | 28 Jul |
| 6 | Store targets | **Google Play + Samsung Galaxy Store + App Store.** Android is the design reference; Samsung is the fastest path to a live in-window release. | 28 Jul |
| 7 | Render service host | **Container on Fly or Railway.** No 15-minute timeout, job queue in-process, predictable cost, and standable-up in a day — which the Wednesday gate requires. Lambda's IAM/layer/bucket setup is time this week does not have. | 28 Jul |
| 8 | No database on device | **Files only** — `project.json` per project directory, no SQLite/MMKV. Search has to read script text anyway, and a separate index is one more thing that can disagree with the truth on disk. The repository module is the seam if project counts ever justify it. | 28 Jul |
| 9 | Shot caption override | **Tri-state**, not boolean: `captionsEnabled: true \| false \| null`, where null inherits `captionStyle.enabled`. A plain boolean cannot express "the agent omitted this", which the import path needs. | 28 Jul |

| 10 | Analytics in v0 | **None.** No product analytics and no crash reporting in the first release, so the privacy policy and Data Safety form can both say "we collect nothing" — which is faster to fill in, impossible to get wrong, and true. §6's growth graph starts at v0.1. | 30 Jul |
| 11 | Contact address | **developer@mothlight.app** — on the privacy page, the support page, and both store listings. Must receive mail before submission; reviewers do write to it. | 30 Jul |
| 12 | Marketing site positioning | Describes v0 **as built: an editor, not a generator.** The site says plainly that there is no AI image or video generation. Promising generation the binary cannot do is both untrue and a misleading-metadata review risk. The agent-authored script import is the differentiator, and it is real. | 30 Jul |

### Still open

- **Render gate (§7) — decide.** Path A is built end to end in code: `apps/render` is a
  Node + Hono + Remotion service with a Dockerfile, and the app has the client, preflight,
  progress screen, and save-to-Photos. **It has never produced a finished MP4**, because
  Remotion 4.x requires macOS 15 and the dev machine is macOS 13.7.8 — the smoke render
  bundles the composition, launches Chromium, and renders frames to ~50%, then dies when
  Remotion's bundled ffmpeg fails to load (`built for macOS 15.0 which is newer than
  running OS`). That is a host limitation, not a code fault, and would not occur in the
  Linux container. **Someone on macOS 15+ or with Docker needs to run
  `bun run --cwd apps/render smoke` before this can be called done.**
- **Push vs poll for render completion** — poll-while-foregrounded is the v0 assumption; a
  local notification on completion covers backgrounding. Confirm before wiring.
  (Poll is implemented; the local notification is not.)
- **Physical Android device** on the dev build — Media3, permissions, and FileProvider
  behaviour all diverge from the emulator. Get one in the loop today, not Thursday.
  **This is now urgent rather than prudent.** As of 28 Jul the dev client builds and runs
  on `Medium_Phone_API_36.1`, and the dashboard renders correctly with the seeded demo,
  but the emulator's own `system_server` ANRs repeatedly under host load and eventually
  crashed outright, which blocks interaction testing. The first Gradle build took 1h 5m.
  A real device would make this loop minutes instead of an hour.
  There is also no full Xcode on the dev machine — only Command Line Tools — so **iOS
  cannot be built or verified here at all**.
- **ElevenLabs licence check** (§4) — still blocking the bundled music beds, and therefore
  blocking the demo project's soundtrack. The demo currently ships with solid-colour
  visuals and no audio at all.
- **Analytics vendor** — PostHog or Mixpanel (§6). Not yet chosen; nothing is wired.
  
