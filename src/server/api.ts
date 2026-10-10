import { mediaResponse } from "./media";
import { parseScreenplay } from "./screenplay";
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
      ),
      media: all(
        "SELECT * FROM media WHERE profile_id=? ORDER BY created_at DESC,id",
        pid,
      ),
      jobs: all(
        "SELECT * FROM jobs WHERE profile_id=? ORDER BY created_at DESC,id LIMIT 100",
        pid,
      ),
      generatorConfigured: !!process.env.MOTHLIGHT_GENERATOR,
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
      requireValue(
        [
          "image/png",
          "image/jpeg",
          "image/webp",
          "video/mp4",
          "video/webm",
          "video/quicktime",
          "audio/wav",
          "audio/x-wav",
          "audio/mpeg",
          "audio/mp4",
          "audio/ogg",
          "audio/flac",
        ].includes(file.type),
        "Unsupported media type.",
      );
      const media = await storeMedia(pid, file, basename(file.name), file.type);
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
      requireValue(
        process.env.MOTHLIGHT_GENERATOR,
        "No generator configured. Upload externally generated media, or configure the adapter.",
        409,
      );
      const shot = scopedRecord("shots", b.shot_id, pid),
        scene = scopedRecord("scenes", shot.scene_id, pid),
        project = scopedRecord("projects", scene.project_id, pid);
      const refs = all(
        "SELECT a.* FROM assets a JOIN shot_assets sa ON sa.asset_id=a.id WHERE sa.shot_id=?",
        shot.id,
      );
      const prompt = textField(
        b.prompt || shot.prompt || shot.action,
        "prompt",
      );
      requireValue(prompt.trim(), "Prompt required.");
      const input = {
        shot,
        project,
        assets: refs.map((a) => ({
          ...a,
          referencePath: a.media_id
            ? mediaPath(scopedRecord("media", a.media_id, pid))
            : null,
        })),
        firstFrame: shot.storyboard_id
          ? mediaPath(scopedRecord("media", shot.storyboard_id, pid))
          : null,
        lastFrame: shot.end_frame_id
          ? mediaPath(scopedRecord("media", shot.end_frame_id, pid))
          : null,
      };
      const jid = id();
      run(
        "INSERT INTO jobs(id,profile_id,shot_id,project_id,kind,provider,model,prompt,input_json) VALUES(?,?,?,?,?,?,?,?,?)",
        jid,
        pid,
        shot.id,
        project.id,
        b.kind,
        textField(b.provider || "custom", "provider", 100),
        textField(b.model || "", "model", 200),
        prompt,
        JSON.stringify(input),
      );
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
