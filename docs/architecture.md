# Narrative production model

## Creative ownership

`User → Membership → Profile` is the authorization boundary. A profile is a creative workspace, not a login identity. Series, projects, shared world assets, media and jobs belong to the profile. Users may be owners, editors or viewers in different profiles.

`Profile → Series (optional) → Project → Scene → Shot → Take` is the story hierarchy. Project kinds distinguish shorts, episodes and features. World assets belong to a profile so recurring characters and locations can be reused across projects. Series bibles hold the larger canon; individual asset entries hold their prompt and continuity rules.

Scenes store their screenplay as editable text, preserving action and character dialogue without forcing an early screenplay AST. Shots independently record the production breakdown, timing, camera, dialogue and generation directions. This supports the same character having standalone shorts before appearing in a main series without changing the hierarchy.

## Toffler reference audit

The reference was inspected at `fergalhanley/toffler`, main commit `31ec1e391575d4d1f11df80287fb5dad2cef1cb7`. Relevant sources: Producer `App.tsx`, server `store.ts`, `jobQueue.ts`, `videoRequest.ts`, and the repository tree. The Producer README is stale and describes a skeleton; the actual app code was used to establish the existing workflow.

Carried forward:

- Script, visuals and audio are adjacent in the editing workspace.
- Projects and sections become projects and scenes, with shots replacing narration segments.
- First/last frames and reference images influence generation requests.
- Generation jobs, reported spend, multiple attempts and media imports remain first-class production records.
- Final craft happens in a finishing tool, with Mothlight managing preparation and rough assembly.

Changed:

- Project JSON files become an authoritative relational SQLite database. JSON remains available as a production snapshot in exports.
- Shared world assets outlive any one film.
- A shot can have several takes; one is explicitly selected. Generation never silently replaces an approved take.
- Audio cues have timeline offsets and trims rather than being only a narration recording for a segment.
- Queue inputs capture creative state and local reference paths. Changing a bible later does not rewrite an earlier generation's input.
- Provider execution is isolated behind an executable contract. Server-side configuration owns credentials; the browser never receives them.

The reference-first planning approach was inspired by the user's AI film research. No claim is made that this reproduces a named creator's private tooling or production process.

## Persistence and integrity

Schema version 1 is initialized idempotently. SQLite foreign keys protect parent relations and deletion. Composite keys constrain project/series and asset/media profile boundaries; server-side relation validation also covers nested shot/take/scene references and MIME categories. Queries identify a profile through its membership, never through an arbitrary client-supplied user ID.

Parent IDs cannot be changed after record creation. Reordering accepts the complete list of sibling IDs and rejects duplicates, omissions and foreign IDs. Selected takes must belong to their shot. Media files are immutable UUID-named uploads; metadata records preserve original filenames and optional source paths.

Future schema changes should add ordered migration scripts and bump the recorded version; do not replace a user's database.

## Jobs and finishing

The worker executes one queued job at a time. Inputs are durable snapshots. A successful image becomes a storyboard; a successful video becomes an unselected take. On restart, queued jobs continue and running jobs become failed rather than being blindly resubmitted. The adapter contract leaves model-specific capability validation, provider polling and price reconciliation with the provider adapter.

FFmpeg normalizes video size/fps and trims the selected take into a shot-sized clip. It concatenates these clips, then mixes audio cues using source trim, duration, gain and timeline delay. Frame counts are rounded once per shot, so the EDL and rough cut agree at 24/25/30 fps. Original video audio is deliberately excluded to avoid doubling dialogue or embedding uncontrollable generated sound.

Resolve export uses non-drop CMX3600 with a timeline start of `01:00:00:00`. It carries straight video cuts, source trims and clip names that match packaged files. The manifest carries frame counts, reel names, original filenames/paths and audio cue placements. The original media is included rather than transcoded solely for the handoff. A zipped handoff streams from disk, rather than loading the archive into server memory.

## Commercial boundaries

Multi-user identity and profile authorization are present now. The local executable adapter is trusted operator code, not something users can upload or configure through the browser. The queue runs in the main Bun process and media is on the local filesystem. These are practical single-server choices for the current local workflow, not a claim of a production SaaS architecture.

A hosted paid version should add controlled onboarding and recovery, quotas and generation budgets, billing, audit history, storage adapters, job leases and isolated worker processes, operational monitoring, and tested backups. SQLite can remain suitable for a single persistent deployment; distributed writers would require revisiting storage and queue coordination.
