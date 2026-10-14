# Mothlight

A local-first narrative filmmaking studio, with Toffler's script / visuals / audio workspace reworked around scenes and shots. Develop stories, keep a shared world bible, produce reference frames and takes, assemble a rough cut, and finish in DaVinci Resolve.

This replaces the previous mobile video app. Its Git history remains intact; the old Expo, Supabase, Next.js and rendering code is no longer part of the app.

## Run the studio

Install **Bun 1.3.7 or newer**, **FFmpeg** (including ffprobe), and **zip**. On macOS, `brew install bun ffmpeg` supplies the first two; zip is normally already installed.

```sh
bun install --frozen-lockfile
bun run dev
```

Open **http://localhost:3000** and create your studio account. No cloud account, API key, Docker container or external database is needed. The first-account setup closes after it succeeds. Use a password of at least 12 characters.

`bun start` runs without watching files. `bun run build`, `bun run typecheck` and `bun test` validate the source and compile the client/server. Run all commands from the repository root.

## Make a film

1. Create a **profile** for a body of work. Profiles separate projects, series, world assets, uploaded media and production jobs. One user can work in several profiles.
2. Create a **series** and its world bible, if the films share a universe. Create a short, episode or feature inside it. After creating a series, it appears in **Film settings → Series** for projects in the same profile. You can also enter **Or create a new series** inside Film settings and save the film to create/select it in one step.
3. Write a treatment and visual direction in **Story**. Add scenes manually or import a Fountain/plain-text screenplay with `INT.` and `EXT.` scene headings. Imports append scenes and preserve the original action and dialogue.
4. Build the profile's **World library**: characters, locations, props, costumes, visual styles and voices. Record their descriptions, reusable prompts, continuity rules and reference media. Use **Import assets** to load a reusable world asset pack from JSON, then attach as many supporting reference files as needed to each asset.
5. In **Shot workspace**, break each scene into shots. Set action, dialogue, camera movement, duration and continuity. Link the relevant world assets. Reorder scenes and shots using their up/down controls. Alternatively, **Import shots** accepts a numbered Markdown shot breakdown; it previews scene matches and incoming counts before making one atomic import. Existing shots are retained, and adding to occupied scenes requires explicit **Append**.
6. Import a storyboard and optional end frame. Import multiple video takes, record provider/model/prompt/cost and review notes, set source trim, compare them, and select a take. Approval requires a selected take.
7. In **Sound**, import dialogue, music, effects and ambience. Set timeline offset, source trim, duration and gain for each cue. A voice asset is a bible/reference entry, not a built-in TTS generator.
8. In **Rough cut**, render the selected shots with FFmpeg. The app normalizes dimensions and frame rate, fits media without cropping, and holds the final frame when a clip is shorter than its planned shot. A queued render captures the project settings, takes and cue timings at submission. Rendered video uses the separate audio cues; embedded take audio is excluded.
9. Download the **Resolve handoff** ZIP. It contains a CMX3600 video EDL, original selected video/audio files, a timing/relink manifest and production JSON. Import the EDL at the manifest frame rate, relink to the `media` directory, and place audio cues using the manifest. Audio track placement is not encoded in the video EDL. This first version supports straight cuts at 24, 25 and 30 fps, without transitions or a full nonlinear editor.

## World Library asset packs and attachments

The World Library belongs to a **profile**, so character, location, prop, costume, voice and style entries can be shared by multiple productions. From **World library → Import assets**, select a `.json` file or paste its contents. Review the preview, then confirm. Matching `(type, name)` entries are skipped, not overwritten, so re-importing the same pack is safe and does not erase manual edits or reference media.

Asset pack v1 (UTF-8 JSON) uses the five editable World Library fields for each asset:

```json
{
  "version": 1,
  "title": "Fates Abound — The Forecast",
  "assets": [
    {
      "kind": "character",
      "name": "Ryan Altair — age 17",
      "description": "A rebellious New York teenager with an instinct for computer systems.",
      "prompt": "Reusable visual-generation reference; proposed appearance and mannerisms.",
      "continuity": "His teenage appearance and relationship to Marisol must remain consistent."
    }
  ]
}
```

- Valid asset `kind` values: `character`, `location`, `prop`, `costume`, `style`, `voice`.
- Every asset requires `kind`, `name`, `description`, `prompt` and `continuity` strings, which are editable after import. Limit: 1 MB JSON pack and 200 assets per import.
- Type and name are compared case-insensitively (with whitespace normalisation) within the **selected profile**. Existing assets are skipped, and the confirmation screen reports creates versus skips. Nothing is overwritten. Adding to a different studio profile creates a separate library entry.
- For each World Library entry use **Edit bible** to edit text, **Cover image** to attach or replace its thumbnail, and **+ Attach file** to add independently labelled references (images, audio, video, Markdown, text, PDF, Word files, 3D model files, ZIP or downloadable binary files). Multiple attachments are supported; previewable formats show previews, others show download links.
- **Remove link** unlinks a reference from an asset but leaves the uploaded file on the Media shelf. The original media remains stored. Image covers use the pre-existing `media_id` field for compatibility with earlier Mothlight installations.
- Text descriptions and continuity notes remain native editable fields. Uploaded documents are downloaded, not executed inline. The asset reference collection is included in snapshots passed to the generation adapter, but generation-provider-specific handling of these references depends on your configured adapter.

## Markdown shot breakdown import

Once you have scenes (for example from Story → Import Fountain), choose **Shot workspace → Import shots**, select a local Markdown file or paste its text, and press **Preview import**. Verify the scene list before confirming. Scene numbers are 1-based in current scene order; repeated headings are distinguished by scene number.

```markdown
## Scene 01 — INT. RYAN'S BEDROOM - NIGHT

### 01.01 · 5s · Medium close-up
**Title:** Ryan answers the phone
**Action:** Ryan turns from his computer when Marisol calls.
**Sound/dialogue:** MARISOL: They're throwing me out.
**Continuity/assets:** Ryan, workstation, phone display.

### 01.02 · 6s · Push-in
**Title:** The Cromwell mark
**Action:** Ryan recognises his father's company on the letter.
**Sound/dialogue:** A low tone replaces the music.
**Continuity/assets:** Eviction letter, Cromwell logo.
```

- `## Scene NN — HEADING` identifies scenes. `### NN.MM · Ns · CAMERA` identifies shots in sequence (fractional seconds supported). The scene heading must match its Fountain heading, with typographic apostrophes and dashes normalised.
- **Title** is optional (derived from action if absent). **Action** is required. **Sound/dialogue** and **Continuity/assets** map to the shot's dialogue and continuity fields. Other Markdown outside numbered scenes is ignored.
- The import does not automatically attach media, world-library asset records, or timeline audio cues.
- Validation and insertion are transactional: mismatched headings or changed shot counts prevent import entirely. Existing shots are never overwritten. **Append** must be explicitly enabled for scenes with existing shots. Re-importing with Append duplicates those shots.
- Limits: Markdown up to 1 MB, 1000 scenes, 2000 shots, 600 seconds per shot.

## Generation tools

BytePlus Seedance video generation is built in. Put your ModelArk API key in the repository-root `.env` file:

```dotenv
BYTEPLUS_MODELARK_API_KEY=your-key-here
```

Restart `bun run dev`, select a shot, and click **Generate video** in **Takes**. Choose **BytePlus · Seedance**, a model, image input mode, duration, resolution and audio setting. Activate your chosen model in the [BytePlus console](https://ai.byteplus.com/ark/region:ap-southeast-1) first. The dropdown is a supported catalogue, not a live account-access check. Optionally set `MOTHLIGHT_SEEDANCE_MODELS` to a comma-separated subset of supported model IDs to show only the models you use.

The catalogue includes Seedance 2.5, 2.0, 2.0 Fast, 2.0 Mini, 1.0 Pro and 1.0 Pro Fast, checked against the [BytePlus model list](https://docs.byteplus.com/en/docs/modelark/model-list) on 2026-10-14. Seedance 1.5 is omitted because BytePlus marks it retired. This integration offers 480p/720p output. First/last frame inputs and World image references are separate modes; video/audio attachments are not sent. World descriptions and shot direction are included as text in all modes. Input images must meet BytePlus size and dimension requirements.

Generation runs in the background and downloads the finished MP4 into the shot’s takes. Refresh the shot or **Production** to see progress. The provider task ID and token usage are retained in the job snapshot. Failed or interrupted requests are never automatically resubmitted; check the BytePlus task history before trying again. The API returns token usage, not final account billing, so BytePlus jobs display **See BytePlus billing** and do not add an estimated charge to recorded spend.

The key stays on the server; `.env` is ignored by Git. No paid generation is performed just by configuring the key or selecting a model.

### Still frames (OpenAI or Nano Banana)

The **Generate frames** action in Shot workspace is separate from Seedance video takes. Configure one or both of these API keys in the server's `.env` file (and restart):

```dotenv
OPENAI_API_KEY=your-openai-api-key
GEMINI_API_KEY=your-google-gemini-api-key
```

Go to **Settings → Generators & integrations** to confirm connections. **Generate frames** can generate a storyboard/start frame, an end frame, or both sequentially. The end-frame request uses the shot's current storyboard image as a reference; in **Both** mode it uses the newly generated storyboard. The image providers receive the shot action, prompt, camera, project visual direction, continuity, and linked World image references. Existing frames remain on the media shelf when a newly generated frame replaces the shot's active frame. Image jobs and outputs are retained in Production.

Supported image providers: **OpenAI GPT Image** (1.5, 1 Mini, 2) and **Google Gemini Nano Banana** (2.1, 2.5 Flash Image, Pro). Image API billing is separate from ChatGPT/Gemini subscriptions. Built-in image-provider jobs display **See provider billing** rather than fabricating a USD charge. Jobs are not automatically retried after failure.

Other image/video tools work through media import or a **provider-neutral local executable adapter**. Configure `MOTHLIGHT_GENERATOR` in `.env` and restart the server. See [the adapter contract](docs/generator-adapter.md).

The executable receives a JSON snapshot containing the shot, camera, dialogue, duration, negative prompt, project style, linked asset descriptions/continuity and local first/last/reference image paths. Image jobs also receive `frameTarget` (`storyboard` or `endframe`). It returns an output path and actual reported cost. Successful video jobs create new takes; successful image jobs attach the requested shot frame. Takes are never selected automatically.

No proprietary provider, API key, model price or unverified third-party workflow is baked into this build. The workflow follows a reference-first approach: world design → storyboard → animate individual shots → review → assemble → finish. Provider-specific adapters are the next extension point, rather than buttons that simulate generation.

Jobs are stored in SQLite and run serially. Queued jobs survive restarts. Interrupted jobs become failed for manual review; the app does not automatically resubmit potentially billable requests. Local failures do not guarantee the provider incurred no charge. Reported costs are in USD and are production bookkeeping, not a billing/reconciliation service.

## Data and accounts

SQLite runs in WAL mode with foreign keys. Metadata is stored in `.mothlight/studio.sqlite`; original and rendered media are in `.mothlight/media/`. Both are ignored by Git. `MOTHLIGHT_DATA_DIR` changes the location. Deleted production records do not delete uploaded files, so retained takes and references can still be recovered manually.

Back up the **whole data directory**, not only the database. Stop the studio before copying it, or use SQLite's backup facilities and also copy all media. The Resolve package is a finishing handoff, not a complete backup of every profile asset.

Passwords use Argon2id. Session tokens are random, stored hashed in SQLite, and sent in HttpOnly, SameSite cookies. Requests are authorized against profile memberships, including nested scene/shot/media routes and every cross-resource reference. Owners manage memberships; editors mutate productions; viewers read and export.

Create another account with the admin CLI. Read a password into an environment variable without putting the password itself in shell history:

```sh
read -s MOTHLIGHT_NEW_PASSWORD
export MOTHLIGHT_NEW_PASSWORD
bun src/server/admin.ts colleague@example.com "Colleague"
unset MOTHLIGHT_NEW_PASSWORD
```

Then use **Profile settings → Manage members** to grant that account editor or viewer access. This creates an existing-user membership; it does not send an invitation or email. There is no public signup, password reset email, subscription billing or hosted account administration UI yet.

## Future hosting

The data model already separates users from work profiles. For controlled hosting behind an HTTPS reverse proxy:

```dotenv
MOTHLIGHT_HOSTED=true
MOTHLIGHT_ORIGIN=https://studio.example.com
HOST=0.0.0.0
MOTHLIGHT_DATA_DIR=/persistent/mothlight
```

Hosted mode requires an HTTPS origin, sets Secure cookies and disables first-user web setup. Provision accounts with the CLI. Forward the original origin through the proxy. SQLite and media need persistent storage on a **single server**; this is not suitable for ephemeral serverless filesystems. Paid public deployment remains a later milestone: account recovery, signup/invitations, quotas/budgets, billing, media retention, hardened provider workers and operational backup need product work before a commercial launch.

## Code map

- `src/client/`: dependency-free TypeScript studio interface, dark theme, responsive layouts.
- `src/server/schema.sql`: relational model and initial schema version.
- `src/server/db.ts`: Bun's native SQLite database and query helpers.
- `src/server/auth.ts`: users, sessions, memberships and authorization.
- `src/server/api.ts`: validated profile-scoped production/media endpoints.
- `src/server/worker.ts`: persisted generation queue and FFmpeg rough-cut rendering.
- `src/server/export.ts`: production documents, frame timing and Resolve EDL.
- `src/server/screenplay.ts`: screenplay scene import.
- `tests/`: database, authentication, isolation, media, generation, rough-cut and handoff integration checks.

See [the architecture notes](docs/architecture.md) for the production model and the specific Toffler ideas carried across.
