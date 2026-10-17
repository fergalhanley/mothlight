import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "mothlight-tests-"));
process.env.MOTHLIGHT_V2_DATA_DIR = root;
delete process.env.MOTHLIGHT_HOSTED;
delete process.env.MOTHLIGHT_GENERATOR;
delete process.env.BYTEPLUS_MODELARK_API_KEY;
delete process.env.MOTHLIGHT_SEEDANCE_MODELS;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
const { handle } = await import("../src/server/index");
const { db, one, all, run, openDatabase } = await import("../src/server/db");
const { createUser, cookie } = await import("../src/server/auth");
const { tick, execProcess } = await import("../src/server/worker");
const { timecode, resolveExport } = await import("../src/server/export");
let owner: any,
  outsider: any,
  viewer: any,
  session: string,
  outsiderSession: string,
  viewerSession: string,
  profile: string,
  otherProfile: string,
  project: any,
  scene: any,
  shot: any,
  video: any,
  audio: any;
async function call(
  path: string,
  method = "GET",
  value?: any,
  auth = session,
  extra: Record<string, string> = {},
) {
  const response = await handle(
    new Request(`http://localhost:3000/api${path}`, {
      method,
      headers: {
        ...extra,
        ...(auth ? { cookie: auth } : {}),
        ...(value !== undefined && !(value instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
      },
      body:
        value instanceof FormData
          ? value
          : value !== undefined
            ? JSON.stringify(value)
            : undefined,
    }),
  );
  return {
    status: response.status,
    headers: response.headers,
    data: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.arrayBuffer(),
  };
}
const p = (path: string) => `/profiles/${profile}/${path}`;
async function post(path: string, value: any) {
  const res = await call(path, "POST", value);
  expect(res.status).toBe(201);
  return res.data;
}
async function upload(path: string, mime: string, name: string) {
  const f = new FormData();
  f.set(
    "file",
    new File([await Bun.file(path).arrayBuffer()], name, { type: mime }),
  );
  return post(p("media"), f);
}
beforeAll(async () => {
  const setup = await call(
    "/auth/setup",
    "POST",
    {
      email: "owner@example.com",
      name: "Owner",
      password: "a secure test password",
    },
    "",
  );
  expect(setup.status).toBe(201);
  owner = setup.data;
  session = setup.headers.get("set-cookie")!.split(";")[0];
  profile = (await call("/profiles")).data[0].id;
  outsider = await createUser(
    "other@example.com",
    "Other user",
    "another secure password",
  );
  outsiderSession = cookie(outsider.id).split(";")[0];
  otherProfile = (await call("/profiles", "GET", undefined, outsiderSession))
    .data[0].id;
  viewer = await createUser(
    "viewer@example.com",
    "Viewer",
    "viewer secure password",
  );
  viewerSession = cookie(viewer.id).split(";")[0];
  await call(p("members"), "POST", { email: viewer.email, role: "viewer" });
  project = await post(p("projects"), {
    title: "Test film",
    width: 64,
    height: 64,
    fps: 24,
  });
  scene = await post(p("scenes"), {
    project_id: project.id,
    heading: "INT. TEST — DAY",
  });
  shot = await post(p("shots"), {
    scene_id: scene.id,
    title: "The first moment",
    duration: 1.25,
  });
  await execProcess([
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=64x64:r=24:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(root, "input.mp4"),
  ]);
  await execProcess([
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    join(root, "input.wav"),
  ]);
  video = await upload(
    join(root, "input.mp4"),
    "video/mp4",
    "original clip.mp4",
  );
  audio = await upload(join(root, "input.wav"), "audio/wav", "dialogue.wav");
}, 30000);
afterAll(async () => {
  db.close();
  await rm(root, { recursive: true, force: true });
});
test("first-user setup closes after bootstrap; passwords are hashed; sessions can log out", async () => {
  expect(
    (
      await call(
        "/auth/setup",
        "POST",
        {
          email: "new@example.com",
          name: "New",
          password: "another long password",
        },
        "",
      )
    ).status,
  ).toBe(409);
  expect(
    one("SELECT password_hash FROM users WHERE id=?", owner.id)!.password_hash,
  ).toStartWith("$argon2id$");
  const login = await call(
    "/auth/login",
    "POST",
    { email: owner.email, password: "a secure test password" },
    "",
  );
  expect(login.status).toBe(200);
  const c = login.headers.get("set-cookie")!.split(";")[0];
  expect((await call("/auth/logout", "POST", {}, c)).status).toBe(200);
  expect((await call("/me", "GET", undefined, c)).status).toBe(401);
});
test("series created in a profile appear in Film settings and remain linked to a project", async () => {
  const created = await post(p("series"), {
    title: "Fates Abound",
    bible: "Shared world and character lore.",
  });
  expect(created.id).toBeTruthy();
  expect(created.title).toBe("Fates Abound");
  const workspace = (await call(p("workspace"))).data;
  expect(workspace.series.some((item: any) => item.id === created.id && item.title === "Fates Abound")).toBe(true);

  const film = await post(p("projects"), { title: "The Forecast" });
  const linked = await call(p("projects/" + film.id), "PATCH", {
    series_id: created.id,
  });
  expect(linked.status).toBe(200);
  expect(linked.data.series_id).toBe(created.id);
  const document = (await call(p("projects/" + film.id + "/document"))).data;
  expect(document.series_id).toBe(created.id);

  // Editing the series updates the same ID, preserving the project's association.
  const edited = await call(p("series/" + created.id), "PATCH", {
    title: "Fates Abound — Revised",
  });
  expect(edited.status).toBe(200);
  const refreshed = (await call(p("workspace"))).data;
  expect(refreshed.series.find((item: any) => item.id === created.id)?.title).toBe("Fates Abound — Revised");
  expect(refreshed.projects.find((item: any) => item.id === film.id)?.series_id).toBe(created.id);

  // Series belong to the current profile, not every connected profile.
  const other = (await call("/profiles/" + otherProfile + "/workspace", "GET", undefined, outsiderSession)).data;
  expect(other.series.some((item: any) => item.id === created.id)).toBe(false);
  expect((await call(p("series"), "POST", { title: "Forbidden" }, viewerSession)).status).toBe(403);
  expect((await call(p("series"), "POST", { title: "" })).status).toBe(400);

  // Persistence in the underlying SQLite database.
  expect(one("SELECT title FROM series WHERE id=? AND profile_id=?", created.id, profile)?.title)
    .toBe("Fates Abound — Revised");
});
test("profile boundary covers projects, media and descendants; viewers cannot mutate", async () => {
  expect(
    (
      await call(
        p(`projects/${project.id}/document`),
        "GET",
        undefined,
        outsiderSession,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        `/profiles/${otherProfile}/projects/${project.id}`,
        "GET",
        undefined,
        outsiderSession,
      )
    ).status,
  ).toBe(404);
  expect(
    (await call(p(`media/${video.id}`), "GET", undefined, outsiderSession))
      .status,
  ).toBe(403);
  expect(
    (
      await call(
        p(`shots/${shot.id}`),
        "PATCH",
        { title: "Hacked" },
        viewerSession,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        p(`projects/${project.id}/document`),
        "GET",
        undefined,
        viewerSession,
      )
    ).status,
  ).toBe(200);
  const foreign = await call(
    `/profiles/${otherProfile}/scenes`,
    "POST",
    { project_id: project.id, heading: "Other scene" },
    outsiderSession,
  );
  expect(foreign.status).toBe(404);
});
test("cross-origin and hostile host requests are rejected", async () => {
  expect(
    (
      await call(p("projects"), "POST", { title: "Bad origin" }, session, {
        origin: "https://attacker.example",
      })
    ).status,
  ).toBe(403);
  const r = await handle(
    new Request("http://attacker.example:3000/api/me", {
      headers: { cookie: session },
    }),
  );
  expect(r.status).toBe(403);
  expect(
    (await call("/me", "GET", undefined, "", { "x-user-id": owner.id })).status,
  ).toBe(401);
});
test("validation rejects invalid state and references, and data survives reconnect", async () => {
  expect(
    (await call(p(`shots/${shot.id}`), "PATCH", { status: "approved" })).status,
  ).toBe(400);
  expect(
    (await call(p(`shots/${shot.id}`), "PATCH", { duration: -1 })).status,
  ).toBe(400);
  expect(
    (await call(p(`shots/${shot.id}`), "PATCH", { selected_take_id: video.id }))
      .status,
  ).toBe(404);
  expect(
    (await call(p(`shots/${shot.id}`), "PATCH", { scene_id: "somewhere-else" }))
      .status,
  ).toBe(400);
  expect(
    (await call(p(`shots/${shot.id}`), "PATCH", { unexpected: "value" }))
      .status,
  ).toBe(400);
  const reopened = openDatabase(join(root, "studio.sqlite"));
  expect(
    (
      reopened
        .query("SELECT title FROM projects WHERE id=?")
        .get(project.id) as any
    ).title,
  ).toBe("Test film");
  reopened.close();
});
test("linked world assets persist; foreign media and takes cannot be linked", async () => {
  const asset = await post(p("assets"), {
    name: "Character",
    kind: "character",
    continuity: "Blue coat",
  });
  expect(
    (await call(p(`shots/${shot.id}/assets`), "PUT", { ids: [asset.id] }))
      .status,
  ).toBe(200);
  expect(
    (await call(p(`projects/${project.id}/document`))).data.scenes[0].shots[0]
      .assets[0].continuity,
  ).toBe("Blue coat");
  const foreign = await call(
    `/profiles/${otherProfile}/assets`,
    "POST",
    { name: "Other asset", kind: "prop" },
    outsiderSession,
  );
  expect(
    (
      await call(p(`shots/${shot.id}/assets`), "PUT", {
        ids: [foreign.data.id],
      })
    ).status,
  ).toBe(404);
  const sh2 = await post(p("shots"), {
    scene_id: scene.id,
    title: "Second shot",
    position: 1,
    duration: 0.75,
  });
  const t = await post(p("takes"), {
    shot_id: sh2.id,
    media_id: video.id,
    label: "Other shot take",
  });
  expect(
    (await call(p(`shots/${shot.id}`), "PATCH", { selected_take_id: t.id }))
      .status,
  ).toBe(400);
  const otherMedia = await call(
    `/profiles/${otherProfile}/media`,
    "POST",
    (() => {
      const f = new FormData();
      f.set("file", new File(["abc"], "reference.png", { type: "image/png" }));
      return f;
    })(),
    outsiderSession,
  );
  expect(
    (
      await call(p(`shots/${shot.id}`), "PATCH", {
        storyboard_id: otherMedia.data.id,
      })
    ).status,
  ).toBe(404);
});
test("scene and shot reordering is complete, ordered and rejects duplicates", async () => {
  const sh = all(
    "SELECT id FROM shots WHERE scene_id=? ORDER BY position",
    scene.id,
  );
  expect(
    (
      await call(p(`projects/${project.id}/reorder`), "POST", {
        kind: "shots",
        sceneId: scene.id,
        ids: [sh[0].id, sh[0].id],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(p(`projects/${project.id}/reorder`), "POST", {
        kind: "shots",
        sceneId: scene.id,
        ids: sh.map((v) => v.id).reverse(),
      })
    ).status,
  ).toBe(200);
  expect(
    (await call(p(`projects/${project.id}/document`))).data.scenes[0].shots[0]
      .id,
  ).toBe(sh[1].id);
});
test("shot Markdown preview maps repeated headings by ordinal; import is safe and transactional", async () => {
  const film = await post(p("projects"), { title: "Import film" });
  const sc1 = await post(p("scenes"), {
    project_id: film.id, position: 0, heading: "INT. RYAN'S BEDROOM - NIGHT",
  });
  const sc2 = await post(p("scenes"), {
    project_id: film.id, position: 1, heading: "INT. RYAN'S BEDROOM - NIGHT",
  });
  const markdown = [
    "# Shot breakdown",
    "## Scene 01 — INT. RYAN’S BEDROOM - NIGHT",
    "### 01.01 · 5s · Slow push",
    "**Title:** Rupert arrives",
    "**Action:** Ryan opens the AI interface.",
    "**Sound/dialogue:** RUPERT: Looking.",
    "**Continuity/assets:** Rupert avatar; Ryan workstation.",
    "## Scene 02 — INT. RYAN'S BEDROOM - NIGHT",
    "### 02.01 · 3.5s · Close-up",
    "**Title:** Ryan smiles",
    "**Action:** Ryan smirks at the locked door.",
    "**Sound/dialogue:** Metal music.",
    "**Continuity/assets:** Ryan",
  ].join("\n");
  const endpoint = p("projects/" + film.id + "/import-shots");
  const preview = await call(endpoint, "POST", { text: markdown, preview: true });
  expect(preview.status).toBe(200);
  expect(preview.data.totalShots).toBe(2);
  expect(preview.data.scenes.map((v: any) => v.scene_id)).toEqual([sc1.id, sc2.id]);
  expect(preview.data.scenes.map((v: any) => v.existing)).toEqual([0, 0]);

  expect((await call(endpoint, "POST", {
    text: markdown, preview: true,
  }, viewerSession)).status).toBe(403);
  const importBody = {
    text: markdown,
    mode: "empty",
    expected: preview.data.scenes.map((v: any) => ({ scene_id: v.scene_id, existing: v.existing })),
  };
  expect((await call(endpoint, "POST", {
    ...importBody, text: markdown.replace("Scene 02", "Scene 03"),
  })).status).toBe(400);
  expect((await call(endpoint, "POST", importBody)).status).toBe(201);
  const doc = (await call(p("projects/" + film.id + "/document"))).data;
  expect(doc.scenes[0].shots.map((v: any) => v.title)).toEqual(["Rupert arrives"]);
  expect(doc.scenes[1].shots[0].duration).toBe(3.5);
  expect(doc.scenes[0].shots[0].continuity).toContain("Rupert avatar");
  expect((await call(endpoint, "POST", importBody)).status).toBe(409);
  expect((await call(endpoint, "POST", { ...importBody, mode: "append" })).status).toBe(409);
  const secondPreview = await call(endpoint, "POST", { text: markdown, preview: true });
  const append = await call(endpoint, "POST", {
    text: markdown,
    mode: "append",
    expected: secondPreview.data.scenes.map((v: any) => ({ scene_id: v.scene_id, existing: v.existing })),
  });
  expect(append.status).toBe(201);
  const final = (await call(p("projects/" + film.id + "/document"))).data;
  expect(final.scenes.map((sc: any) => sc.shots.length)).toEqual([2, 2]);
  expect(final.scenes[0].shots.map((v: any) => v.position)).toEqual([0, 1]);
});
test("world asset packs preview, safely skip existing entries and accept multiple reference types", async () => {
  const content = JSON.stringify({
    version: 1, title: "Fates Abound test bible",
    assets: [
      { kind: "character", name: "Ryan Altair", description: "Young hacker", prompt: "Animated portrait", continuity: "Same outfit" },
      { kind: "prop", name: "Cromwell", description: "Corporate model", prompt: "Dark dashboard", continuity: "Same wordmark" },
    ],
  });
  const endpoint = p("assets/import");
  const preview = await call(endpoint, "POST", { text: content, preview: true });
  expect(preview.status).toBe(200);
  expect(preview.data.create).toBe(2);
  expect(preview.data.skip).toBe(0);
  expect((await call(endpoint, "POST", { text: content, preview: true }, viewerSession)).status).toBe(403);
  const expected = preview.data.assets.map((a: any) => ({
    kind: a.kind, name: a.name, existing_id: a.existing_id,
  }));
  const imported = await call(endpoint, "POST", { text: content, expected });
  expect(imported.status).toBe(201);
  expect(imported.data.created).toBe(2);
  const after = await call(endpoint, "POST", { text: content, preview: true });
  expect(after.data.create).toBe(0);
  expect(after.data.skip).toBe(2);
  expect((await call(endpoint, "POST", { text: content, expected })).status).toBe(409);
  const existingExpected = after.data.assets.map((a: any) => ({
    kind: a.kind, name: a.name, existing_id: a.existing_id,
  }));
  const again = await call(endpoint, "POST", { text: content, expected: existingExpected });
  expect(again.status).toBe(201);
  expect(again.data.created).toBe(0);
  expect(again.data.skipped).toBe(2);
  const workspace = (await call(p("workspace"))).data;
  const ryan = workspace.assets.find((a: any) => a.name === "Ryan Altair");
  const cromwell = workspace.assets.find((a: any) => a.name === "Cromwell");
  expect(ryan.prompt).toBe("Animated portrait");
  expect(cromwell.continuity).toBe("Same wordmark");
  await call(p("assets/" + ryan.id), "PATCH", { description: "User-edited canon" });
  await call(endpoint, "POST", { text: content, expected: existingExpected });
  expect((await call(p("assets/" + ryan.id))).data.description).toBe("User-edited canon");

  const f = new FormData();
  f.set("file", new File(["Character concept notes."], "ryan.md", { type: "text/markdown" }));
  const uploaded = await call(p("media"), "POST", f);
  expect(uploaded.status).toBe(201);
  const refEndpoint = p("assets/" + ryan.id + "/attachments");
  expect((await call(refEndpoint, "POST", {
    media_id: uploaded.data.id, label: "Character concept", notes: "Draft",
  }, viewerSession)).status).toBe(403);
  const attached = await call(refEndpoint, "POST", {
    media_id: uploaded.data.id, label: "Character concept", notes: "Draft",
  });
  expect(attached.status).toBe(201);
  const attached2 = await call(refEndpoint, "POST", {
    media_id: video.id, label: "Motion test", notes: "Provisional",
  });
  expect(attached2.status).toBe(201);
  const refs = (await call(p("workspace"))).data.assets.find((a: any) => a.id === ryan.id).attachments;
  expect(refs.map((a: any) => a.label)).toEqual(["Character concept", "Motion test"]);
  const download = await call(p("media/" + uploaded.data.id));
  expect(download.headers.get("content-disposition")).toContain("attachment");
  expect((await call(refEndpoint + "/" + attached.data.id, "DELETE")).status).toBe(200);
  const remaining = (await call(p("workspace"))).data.assets.find((a: any) => a.id === ryan.id).attachments;
  expect(remaining).toHaveLength(1);
  expect(remaining[0].label).toBe("Motion test");
});
test("selected takes assemble into a frame-accurate rough cut with sound and a portable Resolve handoff", async () => {
  for (const sh of all("SELECT * FROM shots WHERE scene_id=?", scene.id)) {
    const take = await post(p("takes"), {
      shot_id: sh.id,
      media_id: video.id,
      label: "Chosen take",
      cost: 0.12,
      trim_in: 0.25,
    });
    expect(
      (
        await call(p(`shots/${sh.id}`), "PATCH", {
          selected_take_id: take.id,
          status: "approved",
        })
      ).status,
    ).toBe(200);
  }
  await post(p("audio_cues"), {
    project_id: project.id,
    media_id: audio.id,
    label: "Voice",
    kind: "dialogue",
    offset: 0.2,
    duration: 1.5,
    volume: 0.5,
  });
  const exported = resolveExport(project);
  expect(exported.manifest.clips.map((c) => c.durationFrames)).toEqual([
    18, 30,
  ]);
  expect(exported.edl).toContain("01:00:02:00");
  expect(exported.edl).toContain(video.stored_name);
  expect(timecode(24 * 3600 + 25, 24)).toBe("01:00:01:01");
  const job = await call(p(`projects/${project.id}/roughcut`), "POST", {});
  expect(job.status).toBe(202);
  // Changing frame rate after enqueue must not change the immutable render snapshot.
  await call(p(`projects/${project.id}`), "PATCH", { fps: 30 });
  await tick();
  const completed = one("SELECT * FROM jobs WHERE id=?", job.data.id)!;
  expect(completed.error).toBe("");
  expect(completed.status).toBe("succeeded");
  const m = one("SELECT * FROM media WHERE id=?", completed.output_media_id)!;
  const probe = JSON.parse(
    await execProcess([
      "ffprobe",
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      join(root, "media", m.stored_name),
    ]),
  );
  expect(
    probe.streams.find((s: any) => s.codec_type === "video").r_frame_rate,
  ).toBe("24/1");
  expect(Number(probe.format.duration)).toBeCloseTo(2, 1);
  expect(probe.streams.some((s: any) => s.codec_type === "audio")).toBe(true);
  await call(p(`projects/${project.id}`), "PATCH", { fps: 24 });
  const handoff = await call(p(`projects/${project.id}/handoff`));
  expect(handoff.status).toBe(200);
  await Bun.write(join(root, "handoff.zip"), handoff.data);
  const files = await execProcess(["unzip", "-l", join(root, "handoff.zip")]);
  expect(files).toContain("timeline.edl");
  expect(files).toContain(video.stored_name);
  expect(files).toContain(audio.stored_name);
  expect(files).toContain("manifest.json");
  const workspace = (await call(p("workspace"))).data;
  expect(workspace.spend).toBeCloseTo(0.24);
}, 30000);
test("provider jobs store the prompt and references, create takes, and expose explicit failures", async () => {
  expect(
    (await call(p("jobs"), "POST", { shot_id: shot.id, kind: "video" })).status,
  ).toBe(409);
  const adapter = join(root, "adapter");
  await Bun.write(
    adapter,
    `#!${process.execPath}\nconst input=await new Response(Bun.stdin).json();\nconsole.log(JSON.stringify({outputPath:${JSON.stringify(join(root, "input.mp4"))},cost:0.5}));\n`,
  );
  await chmod(adapter, 0o755);
  process.env.MOTHLIGHT_GENERATOR = adapter;
  const response = await call(p("jobs"), "POST", {
    shot_id: shot.id,
    kind: "video",
    provider: "test-adapter",
    model: "test",
    prompt: "A steady camera.",
  });
  expect(response.status).toBe(202);
  const input = JSON.parse(response.data.input_json);
  expect(input.assets[0].continuity).toBe("Blue coat");
  expect(input.project.title).toBe("Test film");
  await tick();
  const job = one("SELECT * FROM jobs WHERE id=?", response.data.id)!;
  expect(job.status).toBe("succeeded");
  expect(job.cost).toBe(0.5);
  expect(
    one("SELECT * FROM takes WHERE media_id=?", job.output_media_id)!.prompt,
  ).toBe("A steady camera.");
  process.env.MOTHLIGHT_GENERATOR = "/missing/adapter";
  const bad = await call(p("jobs"), "POST", {
    shot_id: shot.id,
    kind: "image",
    prompt: "Test",
  });
  await tick();
  expect(one("SELECT status FROM jobs WHERE id=?", bad.data.id)!.status).toBe(
    "failed",
  );
  delete process.env.MOTHLIGHT_GENERATOR;
});

test("image jobs target storyboard and end frame without overwriting video takes", async () => {
  const adapter = join(root, "frame-adapter");
  const png = join(root, "generated.png");
  await Bun.write(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64"));
  await Bun.write(adapter,
    `#!${process.execPath}\nconst input=await new Response(Bun.stdin).json();\nif(input.kind!=="image")throw new Error("Expected an image job");\nconsole.log(JSON.stringify({outputPath:${JSON.stringify(png)},cost:0.11}));\n`);
  await chmod(adapter, 0o755);
  process.env.MOTHLIGHT_GENERATOR = adapter;
  try {
    const queued = await call(p("jobs"), "POST", {
      shot_id: shot.id, kind: "image", provider: "custom",
      frameTarget: "both", prompt: "Generate two cinematic frames",
    });
    expect(queued.status).toBe(202);
    expect(queued.data.ids).toHaveLength(2);
    const [first, second] = queued.data.ids;
    await tick();
    const storyboardJob = one("SELECT * FROM jobs WHERE id=?", first)!;
    expect(storyboardJob.status).toBe("succeeded");
    const storyboardId = one("SELECT storyboard_id FROM shots WHERE id=?", shot.id)!.storyboard_id;
    expect(storyboardId).toBe(storyboardJob.output_media_id);
    await tick();
    const endFrameJob = one("SELECT * FROM jobs WHERE id=?", second)!;
    expect(endFrameJob.status).toBe("succeeded");
    const updated = one("SELECT storyboard_id,end_frame_id FROM shots WHERE id=?", shot.id)!;
    expect(updated.storyboard_id).toBe(storyboardId);
    expect(updated.end_frame_id).toBe(endFrameJob.output_media_id);
    expect(updated.end_frame_id).not.toBe(updated.storyboard_id);
    const endInput = JSON.parse(endFrameJob.input_json);
    expect(endInput.firstFrame).toContain(one("SELECT stored_name FROM media WHERE id=?", storyboardId)!.stored_name);
    expect(endInput.frameTarget).toBe("endframe");
    expect((await call(p("workspace"))).data.spend).toBeGreaterThanOrEqual(0.22);
    const standalone = await call(p("jobs"), "POST", {
      shot_id: shot.id, kind: "image", provider: "custom",
      frameTarget: "endframe", prompt: "Adjust the last frame",
    });
    expect(standalone.status).toBe(202);
    await tick();
    expect(one("SELECT status FROM jobs WHERE id=?", standalone.data.id)!.status).toBe("succeeded");
    expect(one("SELECT storyboard_id FROM shots WHERE id=?", shot.id)!.storyboard_id).toBe(storyboardId);
    expect(one("SELECT end_frame_id FROM shots WHERE id=?", shot.id)!.end_frame_id).not.toBe(updated.end_frame_id);
  } finally {
    delete process.env.MOTHLIGHT_GENERATOR;
  }
}, 30000);

test("Seedance validates model capabilities and keeps image input modes separate", async () => {
  const { seedanceOptions, seedancePayload, seedanceModels } = await import("../src/server/seedance");
  const model = seedanceModels[0].id;
  const file = join(root, "reference.png");
  await Bun.write(file, new Uint8Array([1, 2, 3]));
  const input = { shot: { duration: 5, camera: "Pan slowly", continuity: "Blue coat" }, project: { style: "Watercolour" }, firstFrame: file, lastFrame: file,
    assets: [{ name: "Hero", description: "Detective", attachments: [{ mime: "image/png", localPath: file, filename: "Hero.png" }] }] };
  expect(() => seedanceOptions("unknown", {}, input)).toThrow("supported");
  expect(() => seedanceOptions(model, { duration: 3 }, input)).toThrow("4–30");
  expect(() => seedanceOptions(model, { duration: 5.5 }, input)).toThrow("whole-second");
  expect(() => seedanceOptions(model, { mode: "frames", ratio: "16:9" }, input)).toThrow("adaptive");
  expect(() => seedanceOptions(seedanceModels[5].id, { mode: "frames" }, input)).toThrow("last frame");
  expect(() => seedanceOptions(seedanceModels[4].id, { mode: "references" }, input)).toThrow("World reference");
  expect(() => seedanceOptions(seedanceModels[4].id, { audio: "true" }, input)).toThrow("audio");
  const frames = await seedancePayload(model, "Run", { ...input, seedance: { mode: "frames" } });
  expect(frames.content.map(c => c.role).filter(Boolean)).toEqual(["first_frame", "last_frame"]);
  expect(frames.content[1].image_url.url).toBe("data:image/png;base64,AQID");
  const refs = await seedancePayload(model, "Run", { ...input, seedance: { mode: "references" } });
  expect(refs.content.map(c => c.role).filter(Boolean)).toEqual(["reference_image"]);
  expect(refs.content[0].text).toContain("@Image1: Hero");
  expect(refs.content[0].text).toContain("Pan slowly");
  expect(refs.content[0].text).toContain("Blue coat");
  const text = await seedancePayload(model, "Run", input);
  expect(text.content).toHaveLength(1);
});

test("BytePlus jobs download into takes, retain task usage, and never expose the key", async () => {
  const originalFetch = globalThis.fetch;
  process.env.BYTEPLUS_MODELARK_API_KEY = "test-secret-never-send";
  try {
    const workspace = (await call(p("workspace"))).data;
    expect(workspace.seedanceConfigured).toBe(true);
    expect(JSON.stringify(workspace)).not.toContain(process.env.BYTEPLUS_MODELARK_API_KEY);
    const model = workspace.seedanceModels[0].id;
    const body = { shot_id: shot.id, kind: "video", provider: "byteplus", model, prompt: "A steady camera", duration: 5, mode: "text" };
    expect((await call(p("jobs"), "POST", { ...body, model: "unknown" })).status).toBe(400);
    expect((await call(p("jobs"), "POST", { ...body, kind: "image" })).status).toBe(400);
    const response = await call(p("jobs"), "POST", body);
    expect(response.status).toBe(202);
    let posts = 0;
    globalThis.fetch = (async (target: any, init: any) => {
      const address = String(target);
      if (address === "https://video.example.test/output.mp4") {
        expect(init.headers).toBeUndefined();
        return new Response("test-video", { headers: { "Content-Type": "video/mp4" } });
      }
      expect(address).toStartWith("https://ark.ap-southeast.bytepluses.com/");
      expect(init.headers.Authorization).toBe("Bearer test-secret-never-send");
      if (init.method === "POST") {
        posts++;
        expect(JSON.parse(init.body).model).toBe(model);
        return Response.json({ id: "cgt-test" });
      }
      return Response.json({ status: "succeeded", usage: { completion_tokens: 123 }, content: { video_url: "https://video.example.test/output.mp4" } });
    }) as typeof fetch;
    await tick();
    const job = one("SELECT * FROM jobs WHERE id=?", response.data.id)!;
    expect(job.status).toBe("succeeded");
    expect(posts).toBe(1);
    expect(JSON.parse(job.input_json).byteplusTask).toEqual({ id: "cgt-test", status: "succeeded", usage: { completion_tokens: 123 } });
    expect(job.input_json).not.toContain("test-secret");
    expect(one("SELECT * FROM takes WHERE media_id=?", job.output_media_id)!.model).toBe(model);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BYTEPLUS_MODELARK_API_KEY;
  }
});

test("Seedance polls without resubmitting and reports failed tasks without credentials", async () => {
  const { generateSeedance, seedanceModels } = await import("../src/server/seedance");
  process.env.BYTEPLUS_MODELARK_API_KEY = "secret-for-test";
  try {
    let polls = 0, posts = 0, sleeps = 0;
    const tasks: any[] = [];
    const mockFetch = (async (_target: any, init: any) => {
      if (init.method === "POST") { posts++; return Response.json({ id: "cgt-failed" }); }
      polls++;
      return Response.json(polls === 1 ? { status: "running" } : { status: "failed", error: { message: "Refused secret-for-test" } });
    }) as typeof fetch;
    await expect(generateSeedance(seedanceModels[0].id, "test", { shot: { duration: 5 }, assets: [] }, t => tasks.push(t),
      { fetch: mockFetch, sleep: async () => { sleeps++; } })).rejects.toThrow("BytePlus task cgt-failed: Refused [redacted]");
    expect(posts).toBe(1);
    expect(polls).toBe(2);
    expect(sleeps).toBe(1);
    expect(tasks[0].id).toBe("cgt-failed");
    await expect(generateSeedance(seedanceModels[0].id, "test", { shot: { duration: 5 } }, () => {}, {
      fetch: (async () => Response.json({ error: { message: "Invalid secret-for-test" } }, { status: 401 })) as unknown as typeof fetch,
    })).rejects.toThrow("BytePlus: Invalid [redacted]");
  } finally { delete process.env.BYTEPLUS_MODELARK_API_KEY; }
});

test("screenplay import preserves dialogue and appends scenes without replacing existing work", async () => {
  const film = await post(p("projects"), { title: "Screenplay import" });
  const existing = await post(p("scenes"), {
    project_id: film.id,
    heading: "INT. EXISTING — DAY",
  });
  const imported = await call(
    p(`projects/${film.id}/import-screenplay`),
    "POST",
    {
      text: "Title: Test\r\n\r\nINT. LAB — NIGHT\r\nA light flickers.\r\n\r\nLAVINIA\r\nWhat did you see?\r\n\r\nEXT. STREET — DAWN\r\nThe city wakes.",
    },
  );
  expect(imported.status).toBe(201);
  expect(imported.data.imported).toBe(2);
  const doc = (await call(p(`projects/${film.id}/document`))).data;
  expect(doc.scenes[0].id).toBe(existing.id);
  expect(doc.scenes[1].screenplay).toContain("LAVINIA\nWhat did you see?");
  expect(doc.story).toBe("Title: Test");
  expect(
    (
      await call(p(`projects/${film.id}/import-screenplay`), "POST", {
        text: "No scene headings.",
      })
    ).status,
  ).toBe(400);
  expect(
    (await call(p(`projects/${film.id}/document`))).data.scenes.length,
  ).toBe(3);
});

test("deleting a selected take resets approval; members can be revoked without removing the owner", async () => {
  const sc = await post(p("scenes"), {
    project_id: project.id,
    heading: "INT. DELETE TEST — DAY",
    position: 5,
  });
  const sh = await post(p("shots"), { scene_id: sc.id, title: "Temporary" });
  const take = await post(p("takes"), {
    shot_id: sh.id,
    media_id: video.id,
    label: "Temporary take",
  });
  await call(p(`shots/${sh.id}`), "PATCH", {
    selected_take_id: take.id,
    status: "approved",
  });
  expect((await call(p(`takes/${take.id}`), "DELETE")).status).toBe(200);
  const changed = (await call(p(`shots/${sh.id}`))).data;
  expect(changed.selected_take_id).toBe(null);
  expect(changed.status).toBe("review");
  expect((await call(p(`scenes/${sc.id}`), "DELETE")).status).toBe(200);
  expect((await call(p(`members/${owner.id}`), "DELETE")).status).toBe(400);
  expect((await call(p(`members/${viewer.id}`), "DELETE")).status).toBe(200);
  expect(
    (await call(p("workspace"), "GET", undefined, viewerSession)).status,
  ).toBe(403);
});

test("media byte ranges support seeking without exposing another profile", async () => {
  const partial = await call(
    p(`media/${video.id}`),
    "GET",
    undefined,
    session,
    { Range: "bytes=0-15" },
  );
  expect(partial.status).toBe(206);
  expect(partial.headers.get("content-range")).toBe(`bytes 0-15/${video.size}`);
  expect(partial.data.byteLength).toBe(16);
  const suffix = await call(p(`media/${video.id}`), "GET", undefined, session, {
    Range: "bytes=-10",
  });
  expect(suffix.status).toBe(206);
  expect(suffix.data.byteLength).toBe(10);
  expect(
    (
      await call(p(`media/${video.id}`), "GET", undefined, session, {
        Range: "bytes=999999999-",
      })
    ).status,
  ).toBe(416);
  expect(
    (
      await call(p(`media/${video.id}`), "GET", undefined, outsiderSession, {
        Range: "bytes=0-15",
      })
    ).status,
  ).toBe(403);
});


test("v2 screenplay line anchors survive edits, fork, deletion, and Resolve export", async () => {
  const film = await post(p("projects"), { title:"V2 writing test",fps:24,width:64,height:64 });
  const route = p("v2/projects/" + film.id);
  const initial = (await call(route)).data;
  expect(initial.revision).toBe(0);
  expect(initial.document.content[0].attrs.lineId).toBeTruthy();
  // The server persists the first document so IDs do not change across GETs.
  expect((await call(route)).data.document.content[0].attrs.lineId).toBe(initial.document.content[0].attrs.lineId);
  const originalId = initial.document.content[0].attrs.lineId;
  const nextId = crypto.randomUUID();
  const doc = {type:"doc",content:[
    {type:"screenplayLine",attrs:{lineId:originalId},content:[{type:"text",text:"INT. APARTMENT — NIGHT"}]},
    {type:"screenplayLine",attrs:{lineId:nextId},content:[{type:"text",text:"He reads the letter."}]}
  ]};
  const saved = await call(route+"/screenplay","PUT",{document:doc,revision:0});
  expect(saved.status).toBe(200);
  expect((await call(route+"/screenplay","PUT",{document:doc,revision:0})).status).toBe(409);
  const added = (await call(route+"/takes","POST",{lineId:nextId})).data;
  expect(added.anchor_line_id).toBe(nextId);
  const modified = await call(p("v2/takes/"+added.id),"PATCH",{
    prompt:"Camera pans slowly across the room.",provider:"byteplus",
    options:{duration:5,resolution:"720p",ratio:"9:16",mode:"text",audio:false},
    referenceIds:[]
  });
  expect(modified.status).toBe(200);
  expect(modified.data.prompt).toBe("Camera pans slowly across the room.");
  const forked = (await call(p("v2/takes/"+added.id+"/fork"),"POST",{})).data;
  expect(forked.id).not.toBe(added.id);
  expect(forked.prompt).toBe(modified.data.prompt);
  const imported = await call(p("v2/takes/"+added.id+"/import-video"),"POST",{mediaId:video.id});
  expect(imported.status).toBe(200);
  expect(imported.data.status).toBe("completed");
  expect((await call(p("v2/takes/"+added.id),"PATCH",{prompt:"Change an immutable take"})).status).toBe(409);
  expect((await call(p("v2/takes/"+added.id),"PATCH",{includeInCut:false})).status).toBe(200);
  expect((await call(p("v2/takes/"+added.id),"PATCH",{includeInCut:true})).status).toBe(200);
  const deletedLineDoc = {type:"doc",content:[doc.content[0]]};
  const deletedLine = await call(route+"/screenplay","PUT",{document:deletedLineDoc,revision:saved.data.revision});
  expect(deletedLine.status).toBe(200);
  const afterDeletion = (await call(route)).data;
  expect(afterDeletion.takes.every((t:any)=>t.anchor_line_id===originalId)).toBe(true);
  const reordered = await call(route+"/reorder","POST",{items:[
    {id:forked.id,lineId:originalId},{id:added.id,lineId:originalId}
  ]});
  expect(reordered.status).toBe(200);
  const handoff = await call(route+"/export");
  expect(handoff.status).toBe(200);
  expect(handoff.headers.get("content-type")).toContain("application/zip");
  expect(handoff.data.byteLength).toBeGreaterThan(500);
  expect((await call(route,"GET",undefined,outsiderSession)).status).toBe(403);
});
