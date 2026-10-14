import { mediaResponse } from "./media";
import { parseScreenplay } from "./screenplay";
import { parseShotMarkdown, normalizedHeading } from "./shot-markdown";
import { assetKey, parseWorldAssetPack } from "./world-asset-import";
import { basename, join } from "node:path";
import { mkdir, rm, copyFile } from "node:fs/promises";
import { db, all, one, run, id, dataDir, type Row } from "./db";
import {
  access,
  userFor,
  createUser,
  cookie,
  logout,
  HttpError,
  requireValue,
} from "./auth";
import { projectDocument, projectShots, resolveExport } from "./export";
import { storeMedia, mediaPath, execProcess } from "./worker";
import { availableSeedanceModels, seedanceConfigured, seedanceOptions } from "./seedance";
import { IMAGE_MODELS, imageConfigured } from "./images";
export const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => Response.json(value, { status, headers });
const textField = (v: unknown, name: string, max = 100000) => {
  requireValue(
    typeof v === "string" && v.length <= max,
    `${name} must be text (maximum ${max} characters).`,
  );
  return v as string;
};
const numberField = (v: unknown, min: number, max: number) => {
  requireValue(
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max,
    "Invalid numeric value.",
  );
  return v as number;
};
async function body(req: Request): Promise<Row> {
  try {
    const v = await req.json();
    requireValue(
      v && typeof v === "object" && !Array.isArray(v),
      "Expected an object.",
    );
    return v;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON.");
  }
}
const definitions: Record<
  string,
  { fields: string[]; required: string[]; defaults: Row }
> = {
  series: {
    fields: ["title", "bible"],
    required: ["title"],
    defaults: { bible: "" },
  },
  projects: {
    fields: [
      "title",
      "series_id",
      "kind",
      "logline",
      "story",
      "style",
      "fps",
      "width",
      "height",
    ],
    required: ["title"],
    defaults: {
      series_id: null,
      kind: "short",
      logline: "",
      story: "",
      style: "",
      fps: 24,
      width: 1920,
      height: 1080,
    },
  },
  scenes: {
    fields: ["project_id", "heading", "summary", "screenplay", "position"],
    required: ["project_id", "heading"],
    defaults: { summary: "", screenplay: "", position: 0 },
  },
  shots: {
    fields: [
      "scene_id",
      "title",
      "action",
      "dialogue",
      "camera",
      "prompt",
      "negative_prompt",
      "continuity",
      "duration",
      "position",
      "status",
      "storyboard_id",
      "end_frame_id",
      "selected_take_id",
    ],
    required: ["scene_id", "title"],
    defaults: {
      action: "",
      dialogue: "",
      camera: "",
      prompt: "",
      negative_prompt: "",
      continuity: "",
      duration: 5,
      position: 0,
      status: "planned",
      storyboard_id: null,
      end_frame_id: null,
      selected_take_id: null,
    },
  },
  assets: {
    fields: ["name", "kind", "description", "prompt", "continuity", "media_id"],
    required: ["name", "kind"],
    defaults: { description: "", prompt: "", continuity: "", media_id: null },
  },
  takes: {
    fields: [
      "shot_id",
      "media_id",
      "label",
      "provider",
      "model",
      "prompt",
      "notes",
      "cost",
      "trim_in",
    ],
    required: ["shot_id", "media_id", "label"],
    defaults: {
      provider: "manual",
      model: "",
      prompt: "",
      notes: "",
      cost: 0,
      trim_in: 0,
    },
  },
  audio_cues: {
    fields: [
      "project_id",
      "media_id",
      "label",
      "kind",
      "offset",
      "trim_in",
      "duration",
      "volume",
    ],
    required: ["project_id", "media_id", "label", "kind"],
    defaults: { offset: 0, trim_in: 0, duration: 5, volume: 1 },
  },
};
export function scopedRecord(
  table: string,
  recordId: string,
  profileId: string,
): Row {
  let sql = "";
  if (["series", "projects", "assets", "media", "jobs"].includes(table))
    sql = `SELECT * FROM ${table} WHERE id=? AND profile_id=?`;
  if (table === "scenes")
    sql =
      "SELECT s.* FROM scenes s JOIN projects p ON p.id=s.project_id WHERE s.id=? AND p.profile_id=?";
  if (table === "shots")
    sql =
      "SELECT sh.* FROM shots sh JOIN scenes s ON s.id=sh.scene_id JOIN projects p ON p.id=s.project_id WHERE sh.id=? AND p.profile_id=?";
  if (table === "takes")
    sql =
      "SELECT t.* FROM takes t JOIN shots sh ON sh.id=t.shot_id JOIN scenes s ON s.id=sh.scene_id JOIN projects p ON p.id=s.project_id WHERE t.id=? AND p.profile_id=?";
  if (table === "audio_cues")
    sql =
      "SELECT a.* FROM audio_cues a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.profile_id=?";
  requireValue(sql, "Unknown resource.", 404);
  const record = one(sql, recordId, profileId);
  requireValue(record, "Resource not found.", 404);
  return record;
}
function validate(
  table: string,
  data: Row,
  profileId: string,
  recordId?: string,
) {
  for (const [key, value] of Object.entries(data)) {
    if (key.endsWith("_id")) continue;
    if (
      [
        "duration",
        "cost",
        "trim_in",
        "offset",
        "volume",
        "position",
        "fps",
        "width",
        "height",
      ].includes(key)
    ) {
      const ranges: Record<string, [number, number]> = {
        duration: [0.04, 600],
        cost: [0, 100000],
        trim_in: [0, 86400],
        offset: [0, 86400],
        volume: [0, 4],
        position: [0, 100000],
        fps: [24, 30],
        width: [16, 4096],
        height: [16, 4096],
      };
      numberField(value, ...ranges[key]);
      if (["position", "fps", "width", "height"].includes(key))
        requireValue(Number.isInteger(value), "Expected an integer.");
      if (key === "fps")
        requireValue([24, 25, 30].includes(value), "Use 24, 25, or 30 fps.");
      if (["width", "height"].includes(key))
        requireValue(value % 2 === 0, "Dimensions must be even.");
    } else textField(value, key);
  }
  const enums: Record<string, string[]> = {
    "projects.kind": ["short", "episode", "feature"],
    "shots.status": [
      "planned",
      "storyboard",
      "production",
      "review",
      "approved",
    ],
    "assets.kind": [
      "character",
      "location",
      "prop",
      "costume",
      "style",
      "voice",
    ],
    "audio_cues.kind": ["dialogue", "music", "sfx", "ambience"],
  };
  for (const key of ["kind", "status"])
    if (data[key] !== undefined && enums[`${table}.${key}`])
      requireValue(
        enums[`${table}.${key}`].includes(data[key]),
        `Invalid ${key}.`,
      );
  for (const key of ["title", "name", "heading", "label"])
    if (data[key] !== undefined)
      requireValue(
        data[key].trim().length > 0 && data[key].length <= 500,
        `${key} is required (maximum 500 characters).`,
      );
  const relations: Record<string, string> = {
    series_id: "series",
    project_id: "projects",
    scene_id: "scenes",
    shot_id: "shots",
    media_id: "media",
    storyboard_id: "media",
    end_frame_id: "media",
    selected_take_id: "takes",
  };
  for (const [key, target] of Object.entries(relations))
    if (data[key] != null) {
      textField(data[key], key, 100);
      const related = scopedRecord(target, data[key], profileId);
      if (key === "selected_take_id")
        requireValue(
          related.shot_id === recordId,
          "Select a take belonging to this shot.",
        );
      if (["storyboard_id", "end_frame_id"].includes(key))
        requireValue(
          related.mime.startsWith("image/"),
          "Reference frames must be images.",
        );
      if (key === "media_id" && table === "assets")
        requireValue(
          related.mime.startsWith("image/"),
          "Asset cover must be an image.",
        );
      if (key === "media_id" && table === "takes")
        requireValue(
          related.mime.startsWith("video/"),
          "Takes require video media.",
        );
      if (key === "media_id" && table === "audio_cues")
        requireValue(
          related.mime.startsWith("audio/"),
          "Audio cues require audio media.",
        );
    }
}
const loginAttempts = new Map<string, { count: number; expires: number }>();
export async function api(req: Request): Promise<Response> {
  const url = new URL(req.url),
    path = url.pathname;
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const expected = process.env.MOTHLIGHT_ORIGIN || url.origin;
    requireValue(
      !origin || origin === expected,
      "Cross-origin request denied.",
      403,
    );
    requireValue(
      req.headers.get("sec-fetch-site") !== "cross-site",
      "Cross-site request denied.",
      403,
    );
  }
  if (path === "/api/health") return json({ ok: true });
  if (path === "/api/auth/status" && req.method === "GET")
    return json({
      needsSetup:
        !one("SELECT id FROM users LIMIT 1") &&
        process.env.MOTHLIGHT_HOSTED !== "true",
    });
  if (path === "/api/auth/setup" && req.method === "POST") {
    requireValue(
      process.env.MOTHLIGHT_HOSTED !== "true",
      "Setup disabled in hosted mode.",
      403,
    );
    const b = await body(req);
    const u = await createUser(b.email, b.name, b.password, true);
    return json(u, 201, { "Set-Cookie": cookie(u.id) });
  }
  if (path === "/api/auth/login" && req.method === "POST") {
    const b = await body(req);
    const email = textField(b.email, "email", 255).toLowerCase().trim();
    textField(b.password, "password", 256);
    const now = Date.now();
    for (const [k, v] of loginAttempts)
      if (v.expires < now) loginAttempts.delete(k);
    const a = loginAttempts.get(email) || {
      count: 0,
      expires: now + 15 * 60000,
    };
    a.count++;
    loginAttempts.set(email, a);
    requireValue(
      a.count <= 10,
      "Too many attempts. Try again in 15 minutes.",
      429,
    );
    const u = one("SELECT * FROM users WHERE email=?", email);
    requireValue(
      u && (await Bun.password.verify(b.password, u.password_hash)),
      "Email or password incorrect.",
      401,
    );
    loginAttempts.delete(email);
    return json({ id: u.id, name: u.name, email: u.email }, 200, {
      "Set-Cookie": cookie(u.id),
    });
  }
  const user = userFor(req);
  if (path === "/api/auth/logout" && req.method === "POST")
    return json({ ok: true }, 200, { "Set-Cookie": logout(req) });
  if (path === "/api/me") return json(user);
  if (path === "/api/profiles") {
    if (req.method === "GET")
      return json(
        all(
          "SELECT p.*,m.role FROM profiles p JOIN memberships m ON m.profile_id=p.id WHERE m.user_id=? ORDER BY p.created_at,p.id",
          user.id,
        ),
      );
    if (req.method === "POST") {
      const b = await body(req),
        pid = id();
      textField(b.name, "name", 200);
      requireValue(b.name.trim(), "Name required.");
      db.transaction(() => {
        run(
          "INSERT INTO profiles(id,name,description) VALUES(?,?,?)",
          pid,
          b.name.trim(),
          b.description ? textField(b.description, "description") : "",
        );
        run("INSERT INTO memberships VALUES(?,?,?)", user.id, pid, "owner");
      })();
      return json(one("SELECT * FROM profiles WHERE id=?", pid), 201);
    }
  }
  const match = path.match(/^\/api\/profiles\/([^/]+)(?:\/(.*))?$/);
  requireValue(match, "Route not found.", 404);
  const pid = match[1],
    tail = match[2] || "",
    parts = tail.split("/"),
    write = !["GET", "HEAD"].includes(req.method);
  const membership = access(user.id, pid, write);
  if (!tail && req.method === "PATCH") {
    const b = await body(req);
    textField(b.name, "name", 200);
    requireValue(b.name.trim(), "Name required.");
    run(
      "UPDATE profiles SET name=?,description=? WHERE id=?",
      b.name.trim(),
      textField(b.description ?? "", "description"),
      pid,
    );
    return json(one("SELECT * FROM profiles WHERE id=?", pid));
  }
  if (parts[0] === "members" && parts[1] && req.method === "DELETE") {
    requireValue(
      membership.role === "owner",
      "Only the owner can manage members.",
      403,
    );
    requireValue(
      one(
        "SELECT role FROM memberships WHERE user_id=? AND profile_id=?",
        parts[1],
        pid,
      )?.role !== "owner",
      "Owner memberships cannot be removed.",
    );
    run(
      "DELETE FROM memberships WHERE user_id=? AND profile_id=?",
      parts[1],
      pid,
    );
    return json({ ok: true });
  }
  if (tail === "members") {
    requireValue(
      membership.role === "owner",
      "Only the owner can manage members.",
      403,
    );
    if (req.method === "GET")
      return json(
        all(
          "SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE profile_id=?",
          pid,
        ),
      );
    if (req.method === "POST") {
      const b = await body(req);
      requireValue(
        ["editor", "viewer"].includes(b.role),
        "Choose editor or viewer.",
      );
      const u = one(
        "SELECT id FROM users WHERE email=?",
        textField(b.email, "email", 255).toLowerCase().trim(),
      );
      requireValue(u, "Provision this account with the admin CLI first.", 404);
      requireValue(u.id !== user.id, "Cannot change your own owner role.");
      requireValue(
        one(
          "SELECT role FROM memberships WHERE user_id=? AND profile_id=?",
          u.id,
          pid,
        )?.role !== "owner",
        "Cannot change an owner role.",
      );
      run(
        "INSERT INTO memberships VALUES(?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET role=excluded.role",
        u.id,
        pid,
        b.role,
      );
      return json({ ok: true });
    }
  }
  if (tail === "workspace" && req.method === "GET")
    return json({
      spend: one(
        "SELECT COALESCE((SELECT SUM(t.cost) FROM takes t JOIN shots sh ON sh.id=t.shot_id JOIN scenes sc ON sc.id=sh.scene_id JOIN projects p ON p.id=sc.project_id WHERE p.profile_id=?),0)+COALESCE((SELECT SUM(cost) FROM jobs WHERE profile_id=? AND kind='image'),0) AS total",
        pid,
        pid,
      )!.total,
      series: all(
        "SELECT * FROM series WHERE profile_id=? ORDER BY title",
        pid,
      ),
      projects: all(
        "SELECT * FROM projects WHERE profile_id=? ORDER BY updated_at DESC,id",
        pid,
      ),
      assets: all(
        "SELECT * FROM assets WHERE profile_id=? ORDER BY kind,name",
        pid,
      ).map((a) => ({
        ...a,
        attachments: all(
          "SELECT aa.*,m.filename,m.mime,m.size FROM asset_attachments aa JOIN media m ON m.id=aa.media_id WHERE aa.asset_id=? ORDER BY aa.position,aa.id",
          a.id,
        ),
      })),
      media: all(
        "SELECT * FROM media WHERE profile_id=? ORDER BY created_at DESC,id",
        pid,
      ),
      jobs: all(
        "SELECT * FROM jobs WHERE profile_id=? ORDER BY created_at DESC,id LIMIT 100",
        pid,
      ),
      generatorConfigured: !!process.env.MOTHLIGHT_GENERATOR || seedanceConfigured() || imageConfigured("openai") || imageConfigured("google"),
      adapterConfigured: !!process.env.MOTHLIGHT_GENERATOR,
      seedanceConfigured: seedanceConfigured(),
      seedanceModels: availableSeedanceModels(),
      imageProviders: {
        openai: imageConfigured("openai"),
        google: imageConfigured("google"),
        custom: imageConfigured("custom"),
      },
      imageModels: IMAGE_MODELS,
    });
  if (parts[0] === "media") {
    if (parts[1] && ["GET", "HEAD"].includes(req.method)) {
      const m = scopedRecord("media", parts[1], pid);
      return mediaResponse(req, m);
    }
    if (!parts[1] && req.method === "POST") {
      const form = await req.formData(),
        file = form.get("file");
      requireValue(
        file instanceof File && file.size > 0 && file.size <= 500 * 1024 * 1024,
        "Choose a file up to 500 MB.",
      );
      const extension = file instanceof File ? file.name.split(".").pop()?.toLowerCase() : "";
      const extTypes: Record<string,string> = {
        md: "text/markdown", txt: "text/plain", json: "application/json",
        pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        glb: "model/gltf-binary", gltf: "model/gltf+json",
        zip: "application/zip", svg: "image/svg+xml",
      };
      // Unknown or browser-specific types are retained as downloadable
      // binary references, never served inline with their supplied MIME type.
      const knownMediaTypes = new Set([
        "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml",
        "video/mp4", "video/webm", "video/quicktime", "video/x-matroska",
        "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/ogg",
        "audio/flac", "audio/x-m4a", "audio/aac",
        "text/plain", "text/markdown", "application/json", "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip", "model/gltf-binary", "model/gltf+json",
        "application/octet-stream",
      ]);
      const mime = file instanceof File
        ? (knownMediaTypes.has(file.type)
            ? file.type
            : extTypes[extension || ""] || "application/octet-stream")
        : "";
      requireValue(
        [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "image/avif",
          "video/mp4",
          "video/webm",
          "video/quicktime",
          "video/x-matroska",
          "audio/wav",
          "audio/x-wav",
          "audio/mpeg",
          "audio/mp4",
          "audio/ogg",
          "audio/flac",
          "audio/x-m4a",
          "audio/aac",
          "text/plain",
          "text/markdown",
          "application/json",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/zip",
          "application/octet-stream",
          "model/gltf-binary",
          "model/gltf+json",
          "image/svg+xml",
        ].includes(mime),
        "Unsupported media type.",
      );
      const media = await storeMedia(pid, file, basename(file.name), mime);
      const localPath = form.get("localPath");
      if (typeof localPath === "string")
        run(
          "UPDATE media SET local_path=? WHERE id=?",
          textField(localPath, "localPath", 4096),
          media.id,
        );
      return json(scopedRecord("media", media.id, pid), 201);
    }
  }
  if (parts[0] === "projects" && parts[1] && parts[2]) {
    const project = scopedRecord("projects", parts[1], pid);
    if (parts[2] === "import-shots" && req.method === "POST") {
      const b = await body(req);
      let parsed: ReturnType<typeof parseShotMarkdown>;
      try {
        parsed = parseShotMarkdown(textField(b.text, "shot breakdown", 1_000_000));
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
      const existingScenes = all(
        "SELECT id,heading,position FROM scenes WHERE project_id=? ORDER BY position,id",
        project.id,
      );
      const matches = parsed.map((sc) => {
        const target = existingScenes[sc.number - 1];
        requireValue(target, "Scene " + sc.number + " doesn't exist in this project. Import the screenplay first.");
        requireValue(
          normalizedHeading(target.heading) === normalizedHeading(sc.heading),
          "Scene " + sc.number + " does not match. Expected: " + target.heading + ". Found: " + sc.heading,
        );
        const existing = one(
          "SELECT COUNT(*) AS n FROM shots WHERE scene_id=?",
          target.id,
        )!.n as number;
        return {
          number: sc.number,
          heading: target.heading,
          scene_id: target.id,
          existing,
          incoming: sc.shots.length,
        };
      });
      const totalShots = matches.reduce((n, m) => n + m.incoming, 0);
      if (b.preview === true) return json({ scenes: matches, totalShots });
      requireValue(
        b.mode === "empty" || b.mode === "append",
        "Choose import mode (empty or append).",
      );
      requireValue(
        Array.isArray(b.expected) &&
          b.expected.length === matches.length &&
          matches.every(
            (m, i) =>
              b.expected[i] &&
              b.expected[i].scene_id === m.scene_id &&
              b.expected[i].existing === m.existing,
          ),
        "Scenes or shots changed since preview. Preview the import again.",
        409,
      );
      const created: string[] = [];
      db.transaction(() => {
        for (let i = 0; i < matches.length; i++) {
          const target = matches[i], sc = parsed[i];
          const current = one(
            "SELECT COUNT(*) AS n,MAX(position) AS last FROM shots WHERE scene_id=?",
            target.scene_id,
          )!;
          requireValue(
            current.n === target.existing,
            "Scene " + target.number + " changed during import. Preview again.",
            409,
          );
          requireValue(
            b.mode === "append" || current.n === 0,
            "Scene " + target.number + " already has shots. Enable append or import into empty scenes.",
            409,
          );
          const start = (current.last ?? -1) + 1;
          for (let j = 0; j < sc.shots.length; j++) {
            const sh = sc.shots[j], sid = id();
            run(
              "INSERT INTO shots(id,scene_id,title,action,dialogue,camera,continuity,duration,position) VALUES(?,?,?,?,?,?,?,?,?)",
              sid, target.scene_id, sh.title, sh.action, sh.dialogue,
              sh.camera, sh.continuity, sh.duration, start + j,
            );
            created.push(sid);
          }
        }
        run(
          "UPDATE projects SET updated_at=? WHERE id=?",
          new Date().toISOString(),
          project.id,
        );
      })();
      return json({ imported: created.length, scenes: matches.length, firstShotId: created[0] }, 201);
    }
    if (parts[2] === "import-screenplay" && req.method === "POST") {
      const b = await body(req),
        parsed = parseScreenplay(textField(b.text, "screenplay"));
      requireValue(
        parsed.scenes.length > 0 && parsed.scenes.length <= 1000,
        "Use INT. or EXT. scene headings (maximum 1000 scenes).",
      );
      const start =
        (one(
          "SELECT MAX(position) AS n FROM scenes WHERE project_id=?",
          project.id,
        )?.n ?? -1) + 1;
      db.transaction(() => {
        for (let i = 0; i < parsed.scenes.length; i++) {
          const sc = parsed.scenes[i];
          run(
            "INSERT INTO scenes(id,project_id,heading,screenplay,summary,position) VALUES(?,?,?,?,?,?)",
            id(),
            project.id,
            sc.heading,
            sc.screenplay,
            sc.summary,
            start + i,
          );
        }
        if (!project.story && parsed.preamble)
          run(
            "UPDATE projects SET story=? WHERE id=?",
            parsed.preamble,
            project.id,
          );
      })();
      return json({ imported: parsed.scenes.length }, 201);
    }
    if (parts[2] === "document" && req.method === "GET")
      return json(projectDocument(project.id));
    if (parts[2] === "export" && req.method === "GET")
      return json(resolveExport(project));
    if (parts[2] === "handoff" && req.method === "GET") {
      const exported = resolveExport(project),
        temp = join(dataDir, "work", id());
      await mkdir(join(temp, "media"), { recursive: true });
      try {
        await Bun.write(join(temp, "timeline.edl"), exported.edl);
        await Bun.write(
          join(temp, "manifest.json"),
          JSON.stringify(exported.manifest, null, 2),
        );
        await Bun.write(
          join(temp, "project.json"),
          JSON.stringify(exported.project, null, 2),
        );
        await Bun.write(
          join(temp, "README.txt"),
          "Import timeline.edl into Resolve at the manifest frame rate. Relink clips to media/ using the manifest reel mapping. EDL contains video cuts only. Original clip audio is excluded; place the audio cues from manifest.json on separate tracks using their offset, trim_in, duration and volume. The rough cut mixes those cues automatically. Clip names in the EDL match the packaged media filenames. Keep this package as a portable production snapshot.",
        );
        const mids = new Set([
          ...exported.manifest.clips.map((c) => c.mediaId),
          ...exported.manifest.audio.map((c) => c.media_id),
        ]);
        for (const mid of mids) {
          const m = scopedRecord("media", mid, pid);
          await copyFile(mediaPath(m), join(temp, "media", m.stored_name));
        }
        await execProcess(
          [
            "zip",
            "-q",
            "-r",
            "handoff.zip",
            "timeline.edl",
            "manifest.json",
            "project.json",
            "README.txt",
            "media",
          ],
          { cwd: temp },
        );
        const file = Bun.file(join(temp, "handoff.zip"));
        const reader = file.stream().getReader();
        const stream = new ReadableStream({
          async pull(controller) {
            try {
              const next = await reader.read();
              if (next.done) {
                controller.close();
                await rm(temp, { recursive: true, force: true });
              } else controller.enqueue(next.value);
            } catch (e) {
              controller.error(e);
              await rm(temp, { recursive: true, force: true });
            }
          },
          async cancel() {
            await reader.cancel();
            await rm(temp, { recursive: true, force: true });
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Length": String(file.size),
            "Content-Disposition":
              'attachment; filename="mothlight-handoff.zip"',
          },
        });
      } catch (e) {
        await rm(temp, { recursive: true, force: true });
        throw e;
      }
    }
    if (parts[2] === "roughcut" && req.method === "POST") {
      const shots = projectShots(project.id);
      requireValue(
        shots.length && shots.every((s) => s.media_id),
        "Select a video take for every shot.",
        409,
      );
      const jid = id();
      run(
        "INSERT INTO jobs(id,profile_id,project_id,kind,provider,input_json) VALUES(?,?,?,?,?,?)",
        jid,
        pid,
        project.id,
        "roughcut",
        "ffmpeg",
        JSON.stringify({
          project,
          shots,
          audio: all(
            "SELECT * FROM audio_cues WHERE project_id=? ORDER BY offset",
            project.id,
          ),
        }),
      );
      return json(scopedRecord("jobs", jid, pid), 202);
    }
    if (parts[2] === "reorder" && req.method === "POST") {
      const b = await body(req),
        table =
          b.kind === "scenes" ? "scenes" : b.kind === "shots" ? "shots" : null;
      requireValue(
        table && Array.isArray(b.ids) && b.ids.length <= 10000,
        "Invalid reorder.",
      );
      const parent = table === "scenes" ? project.id : b.sceneId;
      if (table === "shots")
        requireValue(
          scopedRecord("scenes", parent, pid).project_id === project.id,
          "Scene does not belong to project.",
        );
      const column = table === "scenes" ? "project_id" : "scene_id";
      const existing = all(
        `SELECT id FROM ${table} WHERE ${column}=?`,
        parent,
      ).map((r) => r.id);
      requireValue(
        b.ids.length === existing.length &&
          new Set(b.ids).size === existing.length &&
          b.ids.every((v: string) => existing.includes(v)),
        "Reorder must include each item exactly once.",
      );
      db.transaction(() =>
        b.ids.forEach((rid: string, i: number) =>
          run(`UPDATE ${table} SET position=? WHERE id=?`, i, rid),
        ),
      )();
      return json({ ok: true });
    }
  }
  if (parts[0] === "assets" && parts[1] === "import" && req.method === "POST") {
    const b = await body(req);
    let pack: ReturnType<typeof parseWorldAssetPack>;
    try {
      pack = parseWorldAssetPack(textField(b.text, "world asset pack", 1_000_000));
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    const matches = () => {
      const existing = new Map<string, Row>(
        all("SELECT id,kind,name FROM assets WHERE profile_id=?", pid)
          .map((a): [string, Row] => [assetKey(a.kind, a.name), a]),
      );
      return pack.assets.map(a => {
        const found = existing.get(assetKey(a.kind, a.name));
        return { kind: a.kind, name: a.name, existing_id: found?.id ?? null, action: found ? "skip" : "create" };
      });
    };
    const preview = matches();
    if (b.preview === true) return json({
      title: pack.title, assets: preview,
      create: preview.filter(a => a.action === "create").length,
      skip: preview.filter(a => a.action === "skip").length,
    });
    requireValue(Array.isArray(b.expected) && b.expected.length === preview.length &&
      preview.every((a, i) => {
        const e = b.expected[i];
        return e && e.kind === a.kind && e.name === a.name && e.existing_id === a.existing_id;
      }),
      "World library changed since preview. Preview the import again.", 409,
    );
    const created: string[] = [];
    db.transaction(() => {
      const current = matches();
      requireValue(current.every((a, i) => a.existing_id === preview[i].existing_id),
        "World library changed during import. Preview again.", 409);
      for (let i = 0; i < pack.assets.length; i++) {
        const asset = pack.assets[i];
        if (current[i].existing_id) continue;
        const aid = id();
        run(
          "INSERT INTO assets(id,profile_id,kind,name,description,prompt,continuity) VALUES(?,?,?,?,?,?,?)",
          aid,pid,asset.kind,asset.name,asset.description,asset.prompt,asset.continuity,
        );
        created.push(aid);
      }
    })();
    return json({ created: created.length, skipped: preview.length - created.length }, 201);
  }
  if (parts[0] === "assets" && parts[1] && parts[2] === "attachments") {
    const asset = scopedRecord("assets", parts[1], pid);
    if (req.method === "POST" && !parts[3]) {
      const b = await body(req);
      requireValue(b.media_id, "Choose a reference file.");
      const media = scopedRecord("media", b.media_id, pid);
      const label = textField(b.label || media.filename, "label", 500).trim();
      requireValue(label.length > 0, "Label required.");
      const notes = textField(b.notes ?? "", "notes", 100_000);
      const aid = id();
      run(
        "INSERT INTO asset_attachments(id,asset_id,media_id,label,notes,position) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM asset_attachments WHERE asset_id=?))",
        aid,asset.id,media.id,label,notes,asset.id,
      );
      return json(one("SELECT * FROM asset_attachments WHERE id=?", aid), 201);
    }
    if (req.method === "DELETE" && parts[3]) {
      const found = one("SELECT id FROM asset_attachments WHERE id=? AND asset_id=?",parts[3],asset.id);
      requireValue(found, "Attachment not found.", 404);
      run("DELETE FROM asset_attachments WHERE id=?",found.id);
      return json({ ok: true });
    }
  }
  if (
    parts[0] === "shots" &&
    parts[1] &&
    parts[2] === "assets" &&
    req.method === "PUT"
  ) {
    scopedRecord("shots", parts[1], pid);
    const b = await body(req);
    requireValue(
      Array.isArray(b.ids) && b.ids.length <= 100,
      "Invalid asset references.",
    );
    for (const aid of b.ids) scopedRecord("assets", aid, pid);
    db.transaction(() => {
      run("DELETE FROM shot_assets WHERE shot_id=?", parts[1]);
      for (const aid of new Set(b.ids))
        run("INSERT INTO shot_assets VALUES(?,?)", parts[1], aid);
    })();
    return json({ ok: true });
  }
  if (parts[0] === "jobs") {
    if (parts[1] && req.method === "PATCH") {
      const job = scopedRecord("jobs", parts[1], pid);
      requireValue(
        job.status === "queued",
        "Only queued jobs can be cancelled.",
        409,
      );
      run("UPDATE jobs SET status='cancelled' WHERE id=?", job.id);
      return json({ ok: true });
    }
    if (!parts[1] && req.method === "POST") {
      const b = await body(req);
      requireValue(
        ["image", "video"].includes(b.kind),
        "Choose image or video.",
      );
      const provider = textField(b.provider || "custom", "provider", 100);
      const nativeImage = provider === "openai" || provider === "google";
      requireValue(
        provider === "byteplus" ? b.kind === "video" && seedanceConfigured()
          : nativeImage ? b.kind === "image" && imageConfigured(provider)
          : !["byteplus", "openai", "google"].includes(provider) && imageConfigured("custom"),
        "Selected generation service is unavailable. Configure its API key or local adapter in Settings.",
        409,
      );
      if (nativeImage) {
        const models = IMAGE_MODELS[provider as keyof typeof IMAGE_MODELS];
        requireValue(models.some((m) => m.id === b.model), "Unsupported image model.");
      }
      const frameTarget = b.kind === "image" ? (b.frameTarget || "storyboard") : null;
      if (b.kind === "image")
        requireValue(["storyboard", "endframe", "both"].includes(frameTarget), "Choose storyboard, end frame, or both.");
      const shot = scopedRecord("shots", b.shot_id, pid),
        scene = scopedRecord("scenes", shot.scene_id, pid),
        project = scopedRecord("projects", scene.project_id, pid);
      const refs = all(
        "SELECT a.* FROM assets a JOIN shot_assets sa ON sa.asset_id=a.id WHERE sa.shot_id=?",
        shot.id,
      );
      const prompt = textField(b.prompt || shot.prompt || shot.action, "prompt");
      requireValue(prompt.trim(), "Prompt required.");
      const input: Row = {
        shot,
        project,
        assets: refs.map((a) => ({
          ...a,
          referencePath: a.media_id ? mediaPath(scopedRecord("media", a.media_id, pid)) : null,
          attachments: all(
            "SELECT aa.*,m.filename,m.mime,m.stored_name FROM asset_attachments aa JOIN media m ON m.id=aa.media_id WHERE aa.asset_id=? ORDER BY aa.position",
            a.id,
          ).map((ref) => ({ ...ref, localPath: mediaPath(ref) })),
        })),
        firstFrame: shot.storyboard_id ? mediaPath(scopedRecord("media", shot.storyboard_id, pid)) : null,
        lastFrame: shot.end_frame_id ? mediaPath(scopedRecord("media", shot.end_frame_id, pid)) : null,
      };
      if (provider === "byteplus") {
        requireValue(b.kind === "video", "Seedance generates video takes, not still images.");
        input.seedance = seedanceOptions(b.model, b, input);
      }
      const create = (target: string | null, dependsOnJobId: string | null) => {
        const jid = id();
        run(
          "INSERT INTO jobs(id,profile_id,shot_id,project_id,kind,provider,model,prompt,input_json) VALUES(?,?,?,?,?,?,?,?,?)",
          jid, pid, shot.id, project.id, b.kind, provider,
          textField(b.model || "", "model", 200), prompt,
          JSON.stringify({ ...input, frameTarget: target, dependsOnJobId }),
        );
        return jid;
      };
      if (frameTarget === "both") {
        const ids = db.transaction(() => {
          const storyboard = create("storyboard", null);
          const endframe = create("endframe", storyboard);
          return [storyboard, endframe];
        })();
        return json({ ids, queued: 2 }, 202);
      }
      const jid = create(frameTarget, null);
      return json(scopedRecord("jobs", jid, pid), 202);
    }
  }
  const table = parts[0],
    def = definitions[table];
  requireValue(def, "Route not found.", 404);
  if (parts[1] && req.method === "GET")
    return json(scopedRecord(table, parts[1], pid));
  if (
    (req.method === "POST" && !parts[1]) ||
    (req.method === "PATCH" && parts[1])
  ) {
    const existing = parts[1] ? scopedRecord(table, parts[1], pid) : null;
    const b = await body(req);
    for (const key of Object.keys(b))
      requireValue(def.fields.includes(key), `Unknown field: ${key}.`);
    // Moving existing records across parents would invalidate references and timing.
    for (const parent of ["project_id", "scene_id", "shot_id"])
      if (existing && b[parent] !== undefined)
        requireValue(
          b[parent] === existing[parent],
          "Records cannot be moved to another parent.",
        );
    const data = existing ? b : { ...def.defaults, ...b };
    for (const key of def.required)
      if (!existing) requireValue(data[key] != null, `${key} is required.`);
    const rid = parts[1] || id();
    validate(table, data, pid, rid);
    if (table === "shots") {
      const merged = { ...existing, ...data };
      if (merged.status === "approved")
        requireValue(
          merged.selected_take_id,
          "Select a take before approving the shot.",
        );
    }
    const keys = Object.keys(data);
    requireValue(keys.length, "No changes provided.");
    try {
      if (existing)
        run(
          `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
          ...keys.map((k) => data[k]),
          rid,
        );
      else {
        if (["series", "projects", "assets"].includes(table))
          data.profile_id = pid;
        data.id = rid;
        const k = Object.keys(data);
        run(
          `INSERT INTO ${table}(${k.join(",")}) VALUES(${k.map(() => "?").join(",")})`,
          ...k.map((x) => data[x]),
        );
      }
      if (table === "projects")
        run(
          "UPDATE projects SET updated_at=? WHERE id=?",
          new Date().toISOString(),
          rid,
        );
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        400,
        "This change conflicts with related production data.",
      );
    }
    return json(scopedRecord(table, rid, pid), existing ? 200 : 201);
  }
  if (parts[1] && req.method === "DELETE") {
    scopedRecord(table, parts[1], pid);
    requireValue(
      !all(
        "SELECT id FROM jobs WHERE profile_id=? AND status IN ('queued','running')",
        pid,
      ).length,
      "Wait for profile jobs to finish before deleting production data.",
      409,
    );
    try {
      db.transaction(() => {
        if (table === "takes")
          run(
            "UPDATE shots SET selected_take_id=NULL,status='review' WHERE selected_take_id=?",
            parts[1],
          );
        run(`DELETE FROM ${table} WHERE id=?`, parts[1]);
      })();
    } catch {
      throw new HttpError(
        409,
        "This item is still referenced. Remove its references first.",
      );
    }
    return json({ ok: true });
  }
  throw new HttpError(404, "Route not found.");
}
