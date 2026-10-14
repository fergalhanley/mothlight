type R = Record<string, any>;
const app = document.querySelector<HTMLDivElement>("#app")!;
const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
const state: {
  user: R | null;
  profiles: R[];
  profile: string;
  workspace: R;
  project: R | null;
  shot: string;
  tab: string;
  view: string;
} = {
  user: null,
  profiles: [],
  profile: localStorage.getItem("mothlight-profile") || "",
  workspace: { projects: [], series: [], assets: [], media: [], jobs: [] },
  project: null,
  shot: "",
  tab: "shots",
  view: "projects",
};
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const url = (path: string) => `/api/profiles/${state.profile}/${path}`;
const mediaUrl = (mid: string) => url(`media/${mid}`);
const money = (n: number) => `$${n.toFixed(2)}`;
const generationCost = (record: R) => ["byteplus", "openai", "google"].includes(record.provider) && !record.cost ? "See provider billing" : money(record.cost);
const field = (
  label: string,
  name: string,
  value: unknown = "",
  type = "text",
) =>
  `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${type === "number" ? 'step="any" min="0"' : ""}></label>`;
const area = (label: string, name: string, value: unknown = "", rows = 4) =>
  `<label>${esc(label)}<textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;
const select = (
  label: string,
  name: string,
  choices: [string, string][],
  value: string,
) =>
  `<label>${esc(label)}<select name="${name}">${choices.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
const button = (
  label: string,
  action: string,
  attrs = "",
  className = "button",
) =>
  `<button class="${className}" data-action="${action}" ${attrs}>${label}</button>`;
function notice(message: string, error = false) {
  const t = document.querySelector<HTMLDivElement>("#toast")!;
  t.textContent = message;
  t.className = error ? "visible error" : "visible";
  setTimeout(() => (t.className = ""), 5000);
}
async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    headers:
      body instanceof FormData
        ? {}
        : body !== undefined
          ? { "Content-Type": "application/json" }
          : {},
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function loadWorkspace() {
  state.workspace = await request(url("workspace"));
  if (state.project)
    state.project = await request(url(`projects/${state.project.id}/document`));
  render();
}
function shots(): R[] {
  return (
    state.project?.scenes.flatMap((s: R) =>
      s.shots.map((sh: R) => ({ ...sh, heading: s.heading })),
    ) || []
  );
}
function currentShot() {
  return shots().find((s) => s.id === state.shot);
}
function preview(mid: string | undefined, cls = "") {
  if (!mid)
    return `<div class="frame empty ${cls}"><span class="frame-cross">+</span><span>Frame not yet developed</span></div>`;
  const m = state.workspace.media.find((m: R) => m.id === mid);
  return m?.mime.startsWith("video/")
    ? `<video class="frame ${cls}" src="${mediaUrl(mid)}" controls preload="metadata"></video>`
    : m?.mime.startsWith("audio/")
      ? `<audio src="${mediaUrl(mid)}" controls></audio>`
      : m?.mime.startsWith("image/") && m.mime !== "image/svg+xml"
        ? `<img class="frame ${cls}" src="${mediaUrl(mid)}" alt="Reference frame">`
        : `<a class="button" href="${mediaUrl(mid)}" download="${esc(m?.filename || "file")}">Download ${esc(m?.filename || "file")}</a>`;
}
async function init() {
  try {
    const status = await request("/api/auth/status");
    try {
      state.user = await request("/api/me");
    } catch {
      authView(status.needsSetup);
      return;
    }
    state.profiles = await request("/api/profiles");
    if (!state.profiles.some((p) => p.id === state.profile))
      state.profile = state.profiles[0]?.id || "";
    if (state.profile) await loadWorkspace();
    else render();
  } catch (e) {
    app.innerHTML = `<div class="auth"><h1>Unable to open the studio</h1><p>${esc((e as Error).message)}</p>${button("Retry", "retry")}</div>`;
  }
}
function authView(setup: boolean) {
  app.innerHTML = `<main class="auth"><div class="auth-art"><img class="auth-icon" src="/icon.png" alt="Moth with violet, pink, amber, and green wings" width="712" height="712"><span class="eyebrow">THE SPACE BETWEEN STORY AND SCREEN</span><h1>Bring your<br>stories to light.</h1><p>A considered workspace for the films only you can make.</p><div class="wordmark">mothlight</div></div><section><span class="eyebrow">YOUR FILMMAKING STUDIO</span><h2>${setup ? "Make room for your next film." : "Welcome back."}</h2><p>${setup ? "Create your local studio account. Projects and media live on this machine." : "Sign in to your studio."}</p><form data-form="auth" data-setup="${setup}">${setup ? field("Your name", "name") : ""}${field("Email", "email", "", "email")}${field("Password · at least 12 characters", "password", "", "password")}<button class="button primary" type="submit">${setup ? "Create studio" : "Open studio"} <span>↗</span></button></form></section></main>`;
}
function render() {
  stopCoverPreview();
  const p = state.project,
    list = shots(),
    selected = list.filter((s) => s.selected_take_id).length;
  app.innerHTML = `<div class="studio"><aside class="sidebar"><a class="brand" href="/"><img class="brand-icon" src="/icon.png" alt="" width="40" height="40"><span>mothlight</span></a><span class="eyebrow">STUDIO PROFILE</span><select id="profile-switch" aria-label="Studio profile">${state.profiles.map((p) => `<option value="${p.id}" ${p.id === state.profile ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>${button("+ New profile", "profile-new", "", "link muted")}<div class="nav">${[
    ["projects", "▣", "Projects"],
    ["library", "◇", "World library"],
    ["production", "◉", "Production"],
    ["settings", "⚙", "Profile settings"],
  ]
    .map(([v, i, l]) =>
      button(
        `<span>${i}</span>${l}`,
        `view-${v}`,
        "",
        `nav-item ${state.view === v ? "active" : ""}`,
      ),
    )
    .join(
      "",
    )}</div><div class="sidebar-projects"><span class="eyebrow">IN DEVELOPMENT</span>${state.workspace.projects
    .slice(0, 12)
    .map((p: R) =>
      button(
        esc(p.title),
        "open-project",
        `data-id="${p.id}"`,
        `project-link ${p.id === state.project?.id ? "active" : ""}`,
      ),
    )
    .join(
      "",
    )}</div><div class="sidebar-bottom"><span class="local-dot"></span> Local studio<button class="link" data-action="logout">Sign out</button></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">${esc(state.profiles.find((v) => v.id === state.profile)?.name || "Studio")} <span>/</span> ${esc(p?.title || (state.view === "library" ? "World library" : state.view === "production" ? "Production" : "Projects"))}</div><span class="account">${esc(state.user?.name)}</span></header>${
    state.view === "projects"
      ? p
        ? `<div class="project-heading"><div><span class="eyebrow">${esc(state.workspace.series.find((s: R) => s.id === p.series_id)?.title || "INDEPENDENT PRODUCTION")} / ${esc(p.kind)}</span><h1>${esc(p.title)}</h1><p>${esc(p.logline || "Every film begins with an idea.")}</p></div><div class="heading-actions">${button("Film settings", "project-edit")}${button("Resolve handoff ↗", "handoff", "", "button primary")}</div></div><div class="project-nav"><div class="tabs">${[
            ["story", "Story"],
            ["shots", "Shot workspace"],
            ["sound", "Sound"],
            ["cut", "Rough cut"],
          ]
            .map(([v, l]) =>
              button(
                l,
                `tab-${v}`,
                "",
                `tab ${state.tab === v ? "active" : ""}`,
              ),
            )
            .join(
              "",
            )}</div><span>${selected}/${list.length} takes selected · ${list.reduce((n, s) => n + s.duration, 0).toFixed(1)}s</span></div>${state.tab === "story" ? storyView() : state.tab === "shots" ? shotView() : state.tab === "sound" ? soundView() : cutView()}`
        : projectsView()
      : state.view === "library"
        ? libraryView()
        : state.view === "production"
          ? productionView()
          : settingsView()
  }</main></div>`;
  if (state.profiles.find((p) => p.id === state.profile)?.role === "viewer") {
    app
      .querySelectorAll<HTMLFormElement>("form")
      .forEach((f) =>
        f
          .querySelectorAll<HTMLInputElement>("input,textarea,select,button")
          .forEach((el) => (el.disabled = true)),
      );
    const readActions = [
      "refresh",
      "close",
      "logout",
      "retry",
      "open-project",
      "select-shot",
      "cut-shot",
      "handoff",
    ];
    app
      .querySelectorAll<HTMLButtonElement>("button[data-action]")
      .forEach((b) => {
        const a = b.dataset.action!;
        if (
          !readActions.includes(a) &&
          !a.startsWith("view-") &&
          !a.startsWith("tab-") &&
          a !== "profile-new"
        )
          b.disabled = true;
      });
  }
}
function projectsView() {
  return `<section class="page"><div class="page-heading"><div><span class="eyebrow">FROM FIRST IDEA TO FINAL CUT</span><h1>Your stories, taking shape.</h1><p>Develop a film. Build a world. Follow the light.</p></div>${button("+ New project", "project-new", "", "button primary")}</div><div class="section-heading"><h2>Productions <span>${state.workspace.projects.length}</span></h2>${button("+ New series", "series-new", "", "link")}</div><div class="project-grid">${state.workspace.projects.map((p: R, i: number) => `<button class="project-card" data-action="open-project" data-id="${p.id}"><div class="project-cover cover-${i % 3}"><span class="cover-number">${String(i + 1).padStart(2, "0")}</span><div class="cover-lines"></div><span class="cover-type">${esc(p.kind)}</span></div><div class="project-card-body"><span class="eyebrow">${esc(state.workspace.series.find((s: R) => s.id === p.series_id)?.title || "STANDALONE")}</span><h2>${esc(p.title)}</h2><p>${esc(p.logline || "An unwritten possibility.")}</p><span class="card-footer">Open production <span>↗</span></span></div></button>`).join("")}<button class="new-card" data-action="project-new"><span>+</span><h3>Start something new</h3><p>A short, an episode, a whole new world.</p></button></div>${state.workspace.series.length ? `<div class="section-heading"><h2>Series & world bibles</h2></div><div class="series-list">${state.workspace.series.map((s: R) => `<article><div><h3>${esc(s.title)}</h3><p>${esc(s.bible.slice(0, 220) || "Define the rules of this world.")}</p></div>${button("Edit bible", "series-edit", `data-id="${s.id}"`, "button")}</article>`).join("")}</div>` : ""}<div class="workflow-note"><span>01 &nbsp; STORY</span><span>02 &nbsp; WORLD & REFERENCES</span><span>03 &nbsp; SHOTS & TAKES</span><span>04 &nbsp; SOUND & CUT</span><span>05 &nbsp; RESOLVE</span></div></section>`;
}
function storyView() {
  const p = state.project!;
  return `<section class="page"><div class="two-column"><div><div class="section-heading"><h2>Story development</h2></div><form data-form="story">${area("Story / treatment", "story", p.story, 14)}${area("Visual direction", "style", p.style, 5)}<button class="button primary">Save story</button></form></div><div><div class="section-heading"><h2>Screenplay</h2><div class="actions">${button("Import", "screenplay-import")}${button("+ Scene", "scene-new")}</div></div>${p.scenes.map((s: R, i: number) => `<article class="scene-summary"><span class="eyebrow">SCENE ${String(i + 1).padStart(2, "0")}</span><h3>${esc(s.heading)}</h3><p>${esc(s.summary)}</p><pre>${esc(s.screenplay || "Add action and character dialogue to this scene.")}</pre><div class="actions">${button("Edit scene", "scene-edit", `data-id="${s.id}"`)}${button("↑", "scene-up", `data-id="${s.id}"`, "icon-button")}${button("↓", "scene-down", `data-id="${s.id}"`, "icon-button")}</div></article>`).join("") || `<div class="empty-panel"><h3>Set the scene.</h3><p>Write scene headings, action and dialogue, then break each scene into shots.</p></div>`}</div></div></section>`;
}
function shotView() {
  const sh = currentShot();
  return `<div class="shot-layout"><section class="shot-list"><div class="section-heading"><h2>Scene & shot board</h2><div class="actions">${button("Import shots", "shots-import")}${button("+ Scene", "scene-new")}</div></div>${state.project!.scenes.map((s: R, i: number) => `<div class="scene-group"><div class="scene-label"><span>${String(i + 1).padStart(2, "0")} &nbsp; ${esc(s.heading)}</span>${button("+", "shot-new", `data-scene="${s.id}"`, "icon-button")}${button("⋯", "scene-edit", `data-id="${s.id}"`, "icon-button")}</div><div class="shot-columns"><span>SHOT / ACTION</span><span>VISUAL</span><span>AUDIO</span></div>${s.shots.map((sh: R, j: number) => `<button class="shot-row ${sh.id === state.shot ? "selected" : ""}" data-action="select-shot" data-id="${sh.id}"><div><span class="eyebrow">${String(i + 1).padStart(2, "0")}.${String(j + 1).padStart(2, "0")} <span class="status ${sh.status}">${esc(sh.status)}</span></span><h3>${esc(sh.title)}</h3><p>${esc(sh.action || "Describe the moment.")}</p><span class="duration">${sh.duration}s · ${esc(sh.camera || "Camera undecided")}</span></div><div class="thumbnail">${sh.storyboard_id ? `<img src="${mediaUrl(sh.storyboard_id)}" alt="Storyboard">` : `<div class="thumbnail-empty">◇</div>`}<span>${sh.takes.length} take${sh.takes.length === 1 ? "" : "s"}${sh.selected_take_id ? " · selected" : ""}</span></div><div class="dialogue-cell">${sh.dialogue ? `<span class="audio-glyph">≋</span><p>${esc(sh.dialogue)}</p>` : '<span class="muted">No dialogue</span>'}</div></button>`).join("") || `<div class="scene-empty">${button("+ Add the first shot", "shot-new", `data-scene="${s.id}"`, "link")}</div>`}</div>`).join("") || `<div class="empty-panel"><h2>The frame starts here.</h2><p>Create a scene to begin planning your film.</p>${button("+ Add a scene", "scene-new", "", "button primary")}</div>`}</section><aside class="inspector">${sh ? shotInspector(sh) : `<div class="inspector-empty"><span>◇</span><h3>A closer look.</h3><p>Select a shot to shape its action, camera, references and takes.</p></div>`}</aside></div>`;
}
function shotInspector(sh: R) {
  const take = sh.takes.find((t: R) => t.id === sh.selected_take_id);
  return `<div class="inspector-header"><span class="eyebrow">SHOT DETAILS</span><div>${button("↑", "shot-up", `data-id="${sh.id}"`, "icon-button")}${button("↓", "shot-down", `data-id="${sh.id}"`, "icon-button")}</div></div><h2>${esc(sh.title)}</h2>${preview(take?.media_id || sh.storyboard_id)}<div class="actions">${button("Import storyboard", "upload", `data-context="storyboard"`)}${button("Import end frame", "upload", `data-context="endframe"`)}${button("Generate frames", "generate-frames", "", "button accent")}</div>${sh.end_frame_id ? `<details><summary>End-frame reference</summary>${preview(sh.end_frame_id)}</details>` : ""}<form data-form="shot">${field("Shot title", "title", sh.title)}<div class="form-grid">${field("Duration (seconds)", "duration", sh.duration, "number")}${select(
    "Stage",
    "status",
    ["planned", "storyboard", "production", "review", "approved"].map((x) => [
      x,
      x,
    ]),
    sh.status,
  )}</div>${area("Action", "action", sh.action, 3)}${area("Character dialogue", "dialogue", sh.dialogue, 3)}${field("Camera & movement", "camera", sh.camera)}${area("Generation prompt", "prompt", sh.prompt, 4)}${area("Avoid / negative prompt", "negative_prompt", sh.negative_prompt, 2)}${area("Continuity notes", "continuity", sh.continuity, 2)}<button class="button primary">Save shot</button></form><div class="section-heading"><h3>World references</h3></div><form data-form="shot-assets"><div class="references">${state.workspace.assets.map((a: R) => `<label class="check-label"><input type="checkbox" name="asset" value="${a.id}" ${sh.assets.some((v: R) => v.id === a.id) ? "checked" : ""}><span>${esc(a.name)}<small>${esc(a.kind)}</small></span></label>`).join("") || '<p class="muted">Build your world library to link characters, locations and styles.</p>'}</div><button class="button">Save references</button></form><div class="section-heading"><h3>Takes <span>${sh.takes.length}</span></h3><div class="actions">${button("Generate video", "generate-video", "", "button accent")}${button("+ Import", "upload", `data-context="take"`, "link")}</div></div><div class="takes">${sh.takes.map((t: R) => `<article class="take ${t.id === sh.selected_take_id ? "chosen" : ""}">${preview(t.media_id)}<div class="take-heading"><strong>${esc(t.label)}</strong><span>${generationCost(t)}</span></div><p class="muted">${esc(t.provider)} ${esc(t.model)} · trim ${t.trim_in}s</p>${t.notes ? `<p>${esc(t.notes)}</p>` : ""}<div class="actions">${button(t.id === sh.selected_take_id ? "✓ Selected" : "Select take", "take-select", `data-id="${t.id}"`, t.id === sh.selected_take_id ? "button accent" : "button")}${button("Notes & trim", "take-edit", `data-id="${t.id}"`)}${button("×", "delete", `data-table="takes" data-id="${t.id}"`, "icon-button danger")}</div></article>`).join("") || '<p class="muted">Bring in a generated clip to compare and select takes.</p>'}</div><div class="inspector-footer">${button("Delete shot", "delete", `data-table="shots" data-id="${sh.id}"`, "link danger")}</div>`;
}
function soundView() {
  return `<section class="page"><div class="section-heading"><div><h2>Sound design</h2><p class="muted">Place dialogue, music, ambience and effects against the film timeline.</p></div>${button("+ Audio cue", "upload", `data-context="audio"`, "button primary")}</div><div class="audio-list">${state.project!.audio.map((a: R) => `<article><div class="audio-kind">${esc(a.kind)}</div><div class="audio-body"><h3>${esc(a.label)}</h3><audio src="${mediaUrl(a.media_id)}" controls></audio><p>${a.offset}s into film · ${a.duration}s long · source trim ${a.trim_in}s · gain ${a.volume}</p></div><div>${button("Edit", "audio-edit", `data-id="${a.id}"`)}${button("×", "delete", `data-table="audio_cues" data-id="${a.id}"`, "icon-button danger")}</div></article>`).join("") || '<div class="empty-panel"><h3>Give the world a voice.</h3><p>Upload audio and set its placement, source trim, duration and volume.</p></div>'}</div><p class="muted">Rough cuts use the separate audio cues. Audio embedded in generated video takes is excluded.</p></section>`;
}
function cutView() {
  const list = shots(),
    ready = list.length > 0 && list.every((s) => s.selected_take_id),
    jobs = state.workspace.jobs.filter(
      (j: R) => j.project_id === state.project!.id && j.kind === "roughcut",
    );
  return `<section class="page"><div class="section-heading"><div><h2>See the story come together.</h2><p class="muted">Selected takes, in shot order, with your sound design.</p></div><div class="actions">${button("Refresh", "refresh")}${button("Render rough cut", "roughcut", ready ? "" : "disabled", "button primary")}</div></div><div class="cut-summary"><span>${list.length} shots</span><span>${list.reduce((n, s) => n + s.duration, 0).toFixed(1)} seconds</span><span>${state.project!.fps} fps</span><span>${state.project!.width} × ${state.project!.height}</span></div><div class="timeline">${list.map((s, i) => `<button data-action="cut-shot" data-id="${s.id}" class="timeline-clip ${s.selected_take_id ? "ready" : ""}" style="flex-grow:${Math.min(s.duration, 30)}"><span>${String(i + 1).padStart(2, "0")}</span><strong>${esc(s.title)}</strong><small>${s.duration}s ${s.selected_take_id ? "✓" : "missing take"}</small></button>`).join("")}</div>${!ready ? '<p class="warning">Select a video take for every shot before rendering or exporting.</p>' : ""}<div class="roughcuts">${jobs.map((j: R) => `<article><div class="section-heading"><h3>Rough cut <span class="status ${j.status}">${j.status}</span></h3><span>${esc(j.created_at)}</span></div>${j.output_media_id ? preview(j.output_media_id, "cut-player") : ""}${j.error ? `<p class="warning">${esc(j.error)}</p>` : ""}${j.status === "queued" || j.status === "running" ? '<p class="muted">Rendering locally with FFmpeg. Refresh to check progress.</p>' : ""}</article>`).join("")}</div><div class="handoff-note"><div><span class="eyebrow">THE FINAL CRAFT</span><h2>Finish in Resolve.</h2><p>Export a portable package with your original media, video EDL, audio placements and full production notes.</p><p class="muted">The EDL carries video cuts. Place audio tracks using the included manifest.</p></div>${button("Download handoff ↗", "handoff", ready ? "" : "disabled", "button primary")}</div></section>`;
}
function assetImages(asset: R): R[] {
  return (asset.attachments || []).filter(
    (ref: R) => ref.mime?.startsWith("image/") && ref.mime !== "image/svg+xml",
  );
}
function assetCover(asset: R) {
  const attachments: R[] = asset.attachments || [];
  const images = assetImages(asset);
  const image = images[0];
  if (image) return `<button type="button" class="asset-cover" data-action="asset-image" data-id="${esc(asset.id)}" aria-label="View ${esc(asset.name)} image" title="Click to enlarge${images.length > 1 ? ' · Hover to preview images' : ''}"><img class="frame" src="${mediaUrl(image.media_id)}" alt="${esc(image.label || asset.name)}">${images.length > 1 ? `<span class="asset-cover-count">1 / ${images.length}</span>` : ''}</button>`;
  const audio = asset.kind === "voice" || attachments.some(
    (ref) => ref.mime?.startsWith("audio/"),
  );
  const icon = audio ? "♫" : ({
    character: "♙", location: "⌂", prop: "◇", costume: "♧", style: "✦",
  } as R)[asset.kind] || "◇";
  return `<div class="asset-placeholder"${audio ? ' role="img" aria-label="Audio asset"' : ""}><span aria-hidden="true">${icon}</span></div>`;
}
function assetAttachments(asset: R) {
  const attachments: R[] = asset.attachments || [];
  if (!attachments.length) return '<p class="muted">No supporting files yet.</p>';
  return attachments.map((ref) =>
    `<div class="asset-attachment">
      <div><strong>${esc(ref.label || ref.filename)}</strong><small>${esc(ref.mime)}</small></div>
      ${preview(ref.media_id)}
      ${ref.notes ? `<p>${esc(ref.notes)}</p>` : ""}
      <div class="actions">${button("Remove link", "asset-attachment-remove", `data-asset="${asset.id}" data-id="${ref.id}"`, "link danger")}</div>
    </div>`
  ).join("");
}
function libraryView() {
  return `<section class="page"><div class="page-heading"><div><span class="eyebrow">CHARACTERS. PLACES. RULES OF THE WORLD.</span><h1>A world worth returning to.</h1><p>Shared across every production in this profile.</p></div><div class="actions">${button("Import assets", "assets-import")}${button("+ New asset", "asset-new", "", "button primary")}</div></div><div class="asset-grid">${state.workspace.assets.map((a: R) => `<article class="asset-card">${assetCover(a)}<div class="asset-card-body"><span class="eyebrow">${esc(a.kind)}</span><h2>${esc(a.name)}</h2><p>${esc(a.description.slice(0, 160))}</p><div class="actions">${button("Edit bible", "asset-edit", `data-id="${a.id}"`)}${button("+ Attach file", "upload", `data-context="asset-attachment" data-id="${a.id}"`)}${button("×", "delete", `data-table="assets" data-id="${a.id}"`, "icon-button danger")}</div><details><summary>Supporting references (${(a.attachments || []).length})</summary>${assetAttachments(a)}</details></div></article>`).join("") || '<div class="empty-panel"><h2>Establish the constants.</h2><p>Add characters, locations, props, costumes, voices and visual styles. Give each a reference and continuity notes.</p></div>'}</div><div class="section-heading"><h2>Media shelf <span>${state.workspace.media.length}</span></h2>${button("+ Upload media", "upload", `data-context="media"`)}</div><div class="media-shelf">${state.workspace.media.map((m: R) => `<article>${preview(m.id)}<p>${esc(m.filename)}</p><small>${(m.size / 1048576).toFixed(1)} MB</small></article>`).join("")}</div></section>`;
}
function productionView() {
  const costs = state.workspace.spend || 0,
    jobs = state.workspace.jobs;
  return `<section class="page"><div class="page-heading"><div><span class="eyebrow">PRODUCTION CONTROL</span><h1>Every attempt has a place.</h1><p>Durable jobs, original prompts, outputs and reported generation costs.</p></div>${button("Refresh jobs", "refresh")}</div><div class="cut-summary"><span>${jobs.filter((j: R) => j.status === "queued").length} queued</span><span>${jobs.filter((j: R) => j.status === "running").length} running</span><span>${money(costs)} recorded profile spend</span></div><p class="provider-note">${state.workspace.seedanceConfigured ? "BytePlus Seedance connected." : "Seedance video not connected."} ${state.workspace.imageProviders?.openai || state.workspace.imageProviders?.google ? "Image generation connected." : "Set up an image provider in Settings to generate shot frames."} Provider-reported billing for built-in services is not included in recorded spend. Imported take costs appear in each shot.</p><div class="job-list">${jobs.map((j: R) => `<article><span class="job-icon">${j.kind === "roughcut" ? "▣" : j.kind === "image" ? "◇" : "▶"}</span><div><h3>${esc(j.kind)} <span class="status ${j.status}">${esc(j.status)}</span></h3><p>${esc(j.provider)} ${esc(j.model)} · ${esc(j.created_at)}</p><p class="job-prompt">${esc(j.prompt.slice(0, 180))}</p>${j.error ? `<p class="warning">${esc(j.error)}</p>` : ""}${j.output_media_id ? `<a class="link" href="${mediaUrl(j.output_media_id)}" target="_blank" rel="noopener">Open output ↗</a>` : ""}</div><strong>${generationCost(j)}</strong>${j.status === "queued" ? button("Cancel", "job-cancel", `data-id="${j.id}"`) : ""}</article>`).join("") || '<div class="empty-panel"><h3>Ready when you are.</h3><p>Generation attempts and rough-cut renders will appear here.</p></div>'}</div></section>`;
}
function settingsView() {
  const p = state.profiles.find((p) => p.id === state.profile)!;
  const connected = (v: boolean) => v ? "Connected" : "Not configured";
  return `<section class="page narrow"><span class="eyebrow">PROFILE SETTINGS</span><h1>Space for this body of work.</h1><form data-form="profile-edit">${field("Profile name", "name", p.name)}${area("Description", "description", p.description)}<button class="button primary">Save profile</button></form><div class="section-heading"><h2>Generators & integrations</h2></div><p>Configure server-side credentials in your <code>.env</code> file, then restart Mothlight. API subscriptions are billed separately from ChatGPT or Gemini web subscriptions.</p><div class="provider-note"><p><strong>OpenAI · GPT Image:</strong> ${connected(state.workspace.imageProviders?.openai)} · <code>OPENAI_API_KEY</code></p><p><strong>Google · Nano Banana:</strong> ${connected(state.workspace.imageProviders?.google)} · <code>GEMINI_API_KEY</code></p><p><strong>BytePlus · Seedance video:</strong> ${connected(state.workspace.seedanceConfigured)} · <code>BYTEPLUS_MODELARK_API_KEY</code></p><p><strong>Local adapter:</strong> ${connected(state.workspace.adapterConfigured)} · <code>MOTHLIGHT_GENERATOR</code> · see <code>docs/generator-adapter.md</code></p></div><p class="muted">OpenAI and Gemini generate storyboard/end frames. Seedance generates video takes. Provider keys stay on the server and are never stored in shot records.</p><div class="section-heading"><h2>People & permissions</h2>${button("Manage members", "members")}</div><p class="muted">Users can belong to multiple profiles. Owners manage membership; editors work on productions; viewers have read-only access.</p></section>`;
}
function modal(title: string, content: string, form: string, attrs = "") {
  dialog.innerHTML = `<div class="dialog-heading"><h2>${esc(title)}</h2>${button("×", "close", "", "icon-button")}</div><form data-form="${form}" ${attrs}>${content}<div class="dialog-actions">${button("Cancel", "close")}<button class="button primary" type="submit">Save</button></div></form>`;
  dialog.showModal();
}
function projectModal(p?: R) {
  modal(
    p ? "Film settings" : "A new production",
    `${field("Title", "title", p?.title)}${select(
      "Format",
      "kind",
      [
        ["short", "Short film"],
        ["episode", "Episode"],
        ["feature", "Feature"],
      ],
      p?.kind || "short",
    )}${select("Series", "series_id", [["", "Standalone"], ...state.workspace.series.map((s: R) => [s.id, s.title])], p?.series_id || "")}${field("Or create a new series (optional)", "new_series_title")}${area("Logline", "logline", p?.logline, 3)}<div class="form-grid">${select(
      "Frame rate",
      "fps",
      [
        ["24", "24 fps"],
        ["25", "25 fps"],
        ["30", "30 fps"],
      ],
      String(p?.fps || 24),
    )}${field("Width", "width", p?.width || 1920, "number")}${field("Height", "height", p?.height || 1080, "number")}</div>`,
    "project",
    p ? `data-id="${p.id}"` : "",
  );
}
function assetModal(a?: R) {
  modal(
    a ? "World bible entry" : "A new world asset",
    `${field("Name", "name", a?.name)}${select(
      "Type",
      "kind",
      ["character", "location", "prop", "costume", "style", "voice"].map(
        (v) => [v, v],
      ),
      a?.kind || "character",
    )}${area("Description / backstory", "description", a?.description, 5)}${area("Reusable generation prompt", "prompt", a?.prompt, 4)}${area("Continuity rules / must stay consistent", "continuity", a?.continuity, 4)}`,
    "asset",
    a ? `data-id="${a.id}"` : "",
  );
}
function sceneModal(s?: R) {
  modal(
    s ? "Edit scene" : "A new scene",
    `${field("Scene heading", "heading", s?.heading || "INT. LOCATION — NIGHT")}${area("Story purpose / beat", "summary", s?.summary, 3)}${area("Screenplay · action and character dialogue", "screenplay", s?.screenplay, 12)}${s ? button("Delete scene", "delete", `data-table="scenes" data-id="${s.id}"`, "link danger") : ""}`,
    "scene",
    s ? `data-id="${s.id}"` : "",
  );
}
function cueFields(a?: R) {
  return `${field("Label", "label", a?.label)}${select(
    "Track type",
    "kind",
    ["dialogue", "music", "sfx", "ambience"].map((v) => [v, v]),
    a?.kind || "dialogue",
  )}<div class="form-grid">${field("Timeline offset (s)", "offset", a?.offset || 0, "number")}${field("Source trim (s)", "trim_in", a?.trim_in || 0, "number")}${field("Duration (s)", "duration", a?.duration || 5, "number")}${field("Volume (0–4)", "volume", a?.volume ?? 1, "number")}</div>`;
}
function generationFields(provider: string) {
  if (provider !== "byteplus") return '<input type="hidden" name="kind" value="video">' + field("Model", "model") + '<p class="muted">Generates a video take through your local adapter and linked shot references.</p>';
  const models: R[] = state.workspace.seedanceModels || [];
  return `<input type="hidden" name="kind" value="video">` +
    select("Seedance model", "model", models.map(m => [m.id, m.name]), models[0]?.id) +
    `<p class="muted">Choose a model activated in your BytePlus account. This list is the supported catalogue, not a check of your account access.</p>` +
    select("Image inputs", "mode", [["text", "Text only"], ["frames", "Shot first / last frames"], ["references", "Linked World reference images"]], currentShot()?.storyboard_id ? "frames" : "text") +
    `<div class="form-grid">${field("Duration (seconds)", "duration", currentShot()?.duration || 5, "number")}${select("Resolution", "resolution", [["720p", "720p"], ["480p", "480p"]], "720p")}${select("Aspect ratio", "ratio", ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].map(v => [v, v]), "adaptive")}${select("Sound", "audio", [["false", "Silent"], ["true", "Generate audio"]], "false")}</div>` +
    `<p class="muted" id="seedance-capabilities"></p><p class="muted">Visual style, camera, dialogue and continuity text are included. Image inputs follow the selected mode; video and audio attachments are not uploaded. Generation is billed by BytePlus. Completed clips appear as new takes; refresh the shot or Production to check progress.</p>`;
}
function frameGenerationFields(provider: string) {
  if (provider === "custom") return field("Model / adapter option (optional)", "model") + '<p class="muted">Your local adapter must return a PNG for image jobs.</p>';
  const models: R[] = state.workspace.imageModels?.[provider] || [];
  return select("Image model", "model", models.map(m => [m.id, m.name]), models[0]?.id || "");
}
function frameGenerationModal() {
  const providers: [string, string][] = [];
  if (state.workspace.imageProviders?.google) providers.push(["google", "Google · Nano Banana"]);
  if (state.workspace.imageProviders?.openai) providers.push(["openai", "OpenAI · GPT Image"]);
  if (state.workspace.imageProviders?.custom) providers.push(["custom", "Local image adapter"]);
  if (!providers.length) {
    modal(
      "Connect an image generator",
      '<p>Storyboard and end-frame generation need an image service. Add a <code>GEMINI_API_KEY</code> or <code>OPENAI_API_KEY</code> to your server’s <code>.env</code> and restart Mothlight, or configure <code>MOTHLIGHT_GENERATOR</code> for a local image adapter.</p>' +
      '<p class="muted">Seedance is used separately for video takes.</p>' +
      button("Open generator settings", "generator-settings", "", "button accent"),
      "info",
    );
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Close";
    return;
  }
  const sh = currentShot()!;
  const defaultTarget = !sh.storyboard_id ? "storyboard" : !sh.end_frame_id ? "endframe" : "storyboard";
  modal(
    "Generate shot frames",
    select("Create", "frameTarget", [["storyboard", "Storyboard / start frame"], ["endframe", "End frame"], ["both", "Both frames · sequentially"]], defaultTarget) +
      select("Image service", "provider", providers, providers[0][0]) +
      '<div id="image-generation-options">' + frameGenerationFields(providers[0][0]) + '</div>' +
      area("Image prompt", "prompt", sh.prompt || sh.action, 7) +
      '<p class="muted">Uses the shot action, camera, visual style, continuity notes and linked World images. For an end frame, Mothlight includes the current storyboard as a reference. Previous images remain in the media shelf when replaced.</p>',
    "generate-frames",
  );
  dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Queue frame generation";
}
function updateSeedanceFields() {
  const form = dialog.querySelector<HTMLFormElement>('form[data-form="generate"]');
  if (!form || new FormData(form).get("provider") !== "byteplus") return;
  const model = state.workspace.seedanceModels.find((m: R) => m.id === new FormData(form).get("model"));
  if (!model) return;
  const duration = form.querySelector<HTMLInputElement>('[name="duration"]')!;
  duration.min = String(model.minDuration);
  duration.max = String(model.maxDuration);
  duration.step = "1";
  duration.required = true;
  const mode = form.querySelector<HTMLSelectElement>('[name="mode"]')!;
  mode.querySelector<HTMLOptionElement>('[value="references"]')!.disabled = !model.references;
  if (!model.references && mode.value === "references") mode.value = "text";
  const audio = form.querySelector<HTMLSelectElement>('[name="audio"]')!;
  audio.disabled = !model.audio;
  if (!model.audio) audio.value = "false";
  const ratio = form.querySelector<HTMLSelectElement>('[name="ratio"]')!;
  ratio.disabled = model.id === "dreamina-seedance-2-5-260628" && mode.value === "frames";
  if (ratio.disabled) ratio.value = "adaptive";
  form.querySelector("#seedance-capabilities")!.textContent = `${model.minDuration}–${model.maxDuration} seconds · ${model.references ? `Up to ${model.references} World images` : 'No World image references'} · ${model.lastFrame ? 'First and last frames supported' : 'First frame only'}`;
}
async function uploadModal(context: string, assetId = "") {
  let content = `<label>Media file<input name="file" type="file" required accept="${context === "take" ? "video/*" : context === "audio" ? "audio/*" : context === "storyboard" || context === "endframe" ? "image/*" : context === "asset-attachment" ? "*/*" : "image/*,audio/*,video/*,.txt,.md,.json,.pdf,.docx,.zip,.glb"}"></label>${field("Original local path (optional, for Resolve relinking)", "localPath")}`;
  if (context === "asset-attachment")
    content += `<div class="attachment-paste" tabindex="0" role="group" aria-label="Paste an image"><strong>Or paste an image</strong><span>Copy an image, then press ⌘V or Ctrl+V here.</span><span class="attachment-selection" role="status"></span><img class="attachment-preview" alt="Selected attachment preview" hidden></div>` + field("Reference label", "label") + area("Reference notes", "notes", "", 3);
  if (context === "take")
    content += `${field("Take label", "label", `Take ${(currentShot()?.takes.length || 0) + 1}`)}${field("Provider", "provider", "manual")}${field("Model", "model")}${field("Cost (USD)", "cost", 0, "number")}${field("Source trim (s)", "trim_in", 0, "number")}${area("Original prompt", "prompt", currentShot()?.prompt)}${area("Review notes", "notes")}`;
  if (context === "audio") content += cueFields();
  modal(
    "Import production media",
    content,
    "upload",
    `data-context="${context}" data-id="${assetId}"`,
  );
}
async function reorder(table: string, itemId: string, direction: number) {
  const p = state.project!;
  const scene = p.scenes.find((s: R) =>
    s.shots.some((sh: R) => sh.id === itemId),
  );
  const list = table === "scenes" ? p.scenes : scene?.shots;
  const ids = list.map((x: R) => x.id),
    index = ids.indexOf(itemId),
    next = index + direction;
  if (next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  await request(url(`projects/${p.id}/reorder`), "POST", {
    kind: table,
    ids,
    sceneId: scene?.id,
  });
  await loadWorkspace();
}
app.addEventListener("change", async (e) => {
  const target = e.target as HTMLSelectElement;
  if (target.id === "profile-switch") {
    state.profile = target.value;
    localStorage.setItem("mothlight-profile", state.profile);
    state.project = null;
    state.shot = "";
    await loadWorkspace();
  }
});
async function action(el: HTMLElement) {
  const a = el.dataset.action!,
    rid = el.dataset.id!;
  if (a === "asset-image") {
    stopCoverPreview();
    const asset = state.workspace.assets.find((asset: R) => asset.id === rid);
    viewerImages = assetImages(asset);
    viewerIndex = Number(el.dataset.index || 0);
    const cover = el.querySelector<HTMLImageElement>("img")!;
    imageViewer.innerHTML = `<button type="button" class="image-viewer-close icon-button" aria-label="Close image viewer" autofocus>×</button><img src="${esc(cover.src)}" alt="${esc(cover.alt)}">${viewerImages.length > 1 ? `<button type="button" class="image-viewer-prev icon-button" aria-label="Previous image">←</button><button type="button" class="image-viewer-next icon-button" aria-label="Next image">→</button><span class="image-viewer-count" role="status">${viewerIndex + 1} / ${viewerImages.length}</span>` : ''}`;
    imageViewer.showModal();
    return;
  }
  if (a === "retry") {
    await init();
    return;
  }
  if (a === "close") {
    dialog.close();
    return;
  }
  if (a === "logout") {
    await request("/api/auth/logout", "POST", {});
    state.user = null;
    await init();
    return;
  }
  if (a.startsWith("view-")) {
    state.view = a.slice(5);
    state.project = null;
    render();
    return;
  }
  if (a.startsWith("tab-")) {
    state.tab = a.slice(4);
    render();
    return;
  }
  if (a === "open-project") {
    state.project = await request(url(`projects/${rid}/document`));
    state.view = "projects";
    state.shot = shots()[0]?.id || "";
    state.tab = "shots";
    render();
    return;
  }
  if (a === "select-shot" || a === "cut-shot") {
    state.shot = rid;
    if (a === "cut-shot") state.tab = "shots";
    render();
    return;
  }
  if (a === "shots-import") {
    modal(
      "Import shot breakdown",
      '<label>Markdown file<input id="shots-import-file" type="file" accept=".md,text/markdown,text/plain"></label>' +
        area("Or paste Markdown shot breakdown", "text", "", 12) +
        '<p class="muted">Scene numbers and headings must match the screenplay. Preview before importing; existing shots are never overwritten.</p>',
      "shots-import-preview",
    );
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Preview import";
    return;
  }
  if (a === "screenplay-import") {
    modal(
      "Import a screenplay",
      area(
        "Paste Fountain or plain text with INT. / EXT. scene headings",
        "text",
        "",
        16,
      ) +
        '<p class="muted">Scenes are appended. Existing scene and shot work is retained.</p>',
      "screenplay-import",
    );
    return;
  }
  if (a === "project-new") {
    projectModal();
    return;
  }
  if (a === "project-edit") {
    projectModal(state.project!);
    return;
  }
  if (a === "profile-new") {
    modal(
      "A separate creative workspace",
      field("Profile name", "name") + area("Description", "description"),
      "profile",
    );
    return;
  }
  if (a === "series-new" || a === "series-edit") {
    const s = state.workspace.series.find((s: R) => s.id === rid);
    modal(
      s ? "Series bible" : "A new series",
      field("Series title", "title", s?.title) +
        area(
          "World rules, lore & overall visual direction",
          "bible",
          s?.bible,
          12,
        ),
      "series",
      s ? `data-id="${s.id}"` : "",
    );
    return;
  }
  if (a === "assets-import") {
    modal(
      "Import world asset pack",
      '<label>Asset pack JSON<input id="assets-import-file" type="file" accept=".json,application/json"></label>' +
      area("Or paste the JSON asset pack", "text", "", 10) +
      '<p class="muted">Import adds assets to this profile’s shared World library. Existing assets with the same type and name will be skipped, never overwritten.</p>',
      "assets-import-preview",
    );
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Preview assets";
    return;
  }
  if (a === "asset-attachment-remove") {
    if (!window.confirm("Unlink this reference from the asset? The uploaded file remains in the media shelf.")) return;
    await request(url("assets/" + el.dataset.asset + "/attachments/" + rid), "DELETE");
    await loadWorkspace();
    notice("Reference unlinked.");
    return;
  }
  if (a === "asset-new" || a === "asset-edit") {
    assetModal(state.workspace.assets.find((s: R) => s.id === rid));
    return;
  }
  if (a === "scene-new" || a === "scene-edit") {
    sceneModal(state.project!.scenes.find((s: R) => s.id === rid));
    return;
  }
  if (a === "shot-new") {
    modal(
      "A new shot",
      field("Shot title", "title", "Untitled shot") +
        area("Action", "action") +
        field("Duration (seconds)", "duration", 5, "number"),
      "shot-new",
      `data-scene="${el.dataset.scene}"`,
    );
    return;
  }
  if (a === "upload") {
    await uploadModal(el.dataset.context!, rid);
    return;
  }
  if (a === "take-select") {
    await request(url(`shots/${state.shot}`), "PATCH", {
      selected_take_id: rid,
      status: "review",
    });
    await loadWorkspace();
    notice("Take selected for the cut.");
    return;
  }
  if (a === "take-edit") {
    const t = currentShot()!.takes.find((t: R) => t.id === rid);
    modal(
      "Review take",
      field("Label", "label", t.label) +
        field("Source trim (s)", "trim_in", t.trim_in, "number") +
        field("Reported cost (USD)", "cost", t.cost, "number") +
        area("Review notes", "notes", t.notes),
      "take",
      `data-id="${rid}"`,
    );
    return;
  }
  if (a === "audio-edit") {
    const cue = state.project!.audio.find((c: R) => c.id === rid);
    modal("Sound placement", cueFields(cue), "audio", `data-id="${rid}"`);
    return;
  }
  if (a === "delete") {
    modal(
      "Delete this item?",
      `<p>This removes the ${esc(el.dataset.table)} entry and its dependent production records. Media files are retained.</p>`,
      "delete",
      `data-id="${rid}" data-table="${el.dataset.table}"`,
    );
    return;
  }
  if (a === "scene-up" || a === "scene-down") {
    await reorder("scenes", rid, a.endsWith("up") ? -1 : 1);
    return;
  }
  if (a === "shot-up" || a === "shot-down") {
    await reorder("shots", rid, a.endsWith("up") ? -1 : 1);
    return;
  }
  if (a === "refresh") {
    await loadWorkspace();
    return;
  }
  if (a === "roughcut") {
    await request(url(`projects/${state.project!.id}/roughcut`), "POST", {});
    await loadWorkspace();
    notice("Rough cut queued.");
    return;
  }
  if (a === "handoff") {
    await request(url(`projects/${state.project!.id}/export`));
    const link = document.createElement("a");
    link.href = url(`projects/${state.project!.id}/handoff`);
    link.download = "mothlight-handoff.zip";
    link.click();
    notice("Preparing your Resolve download…");
    return;
  }
  if (a === "job-cancel") {
    await request(url(`jobs/${rid}`), "PATCH", {});
    await loadWorkspace();
    return;
  }
  if (a === "generate-frames") {
    frameGenerationModal();
    return;
  }
  if (a === "generator-settings") {
    dialog.close();
    state.view = "settings";
    state.project = null;
    render();
    return;
  }
  if (a === "generate-video") {
    if (!state.workspace.seedanceConfigured && !state.workspace.adapterConfigured) {
      modal(
        "Connect a video generator",
        '<p>Set <code>BYTEPLUS_MODELARK_API_KEY</code> for Seedance or <code>MOTHLIGHT_GENERATOR</code> for a local adapter. Restart Mothlight after editing <code>.env</code>.</p>' +
        button("Open generator settings", "generator-settings", "", "button accent"),
        "info",
      );
      dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Close";
      return;
    }
    const providers: [string, string][] = [];
    if (state.workspace.seedanceConfigured) providers.push(["byteplus", "BytePlus · Seedance"]);
    if (state.workspace.adapterConfigured) providers.push(["custom", "Local adapter"]);
    modal(
      "A new generation attempt",
      select("Generation service", "provider", providers, providers[0][0]) +
        `<div id="generation-options">${generationFields(providers[0][0])}</div>` +
        area("Prompt", "prompt", currentShot()?.prompt || currentShot()?.action, 8),
      "generate",
    );
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Generate";
    updateSeedanceFields();
    return;
  }
  if (a === "member-remove") {
    await request(url(`members/${rid}`), "DELETE");
    dialog.close();
    notice("Member removed.");
    return;
  }
  if (a === "members") {
    const members = await request(url("members"));
    modal(
      "Profile membership",
      `<div>${members.map((m: R) => `<p>${esc(m.name)} · ${esc(m.email)} <span class="status">${esc(m.role)}</span> ${m.role !== "owner" ? button("Remove", "member-remove", `data-id="${m.id}"`, "link danger") : ""}</p>`).join("")}</div>${field("Existing user email", "email", "", "email")}${select(
        "Access",
        "role",
        [
          ["editor", "Editor"],
          ["viewer", "Viewer"],
        ],
        "editor",
      )}<p class="muted">Create additional users with the admin CLI before adding them here.</p>`,
      "member",
    );
    return;
  }
}
async function submit(form: HTMLFormElement) {
  const type = form.dataset.form!,
    values = new FormData(form),
    b: R = Object.fromEntries(values.entries()),
    rid = form.dataset.id;
  const num = (...keys: string[]) => keys.forEach((k) => (b[k] = Number(b[k])));
  if (type === "assets-import-preview") {
    const source = String(b.text || "");
    const result = await request(url("assets/import"), "POST", { text: source, preview: true });
    const rows: R[] = result.assets;
    const details = rows.map(a =>
      '<p><strong>' + esc(a.kind) + ' · ' + esc(a.name) + '</strong> — ' +
      (a.action === "create" ? "Create" : "Skip existing") + '</p>'
    ).join("");
    dialog.close();
    modal(
      "Review world asset import",
      '<p><strong>' + result.create + ' new assets, ' + result.skip +
      ' existing assets skipped.</strong> Nothing has been saved yet.</p>' +
      '<div style="max-height:260px;overflow:auto">' + details + '</div>' +
      '<textarea name="text" hidden>' + esc(source) + '</textarea>' +
      '<input name="expected" type="hidden" value="' +
      esc(JSON.stringify(rows.map(a => ({ kind: a.kind, name: a.name, existing_id: a.existing_id })))) + '">',
      "assets-import-confirm",
    );
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Import assets";
    return;
  }
  if (type === "assets-import-confirm") {
    const result = await request(url("assets/import"), "POST", {
      text: String(b.text || ""), expected: JSON.parse(String(b.expected)),
    });
    dialog.close();
    state.view = "library";
    await loadWorkspace();
    notice("Imported " + result.created + " assets; skipped " + result.skipped + " existing.");
    return;
  }
  if (type === "shots-import-preview") {
    const source = String(b.text || "");
    const previewResult = await request(
      url("projects/" + state.project!.id + "/import-shots"),
      "POST",
      { text: source, preview: true },
    );
    const matches: R[] = previewResult.scenes;
    const occupied = matches.some((m) => m.existing > 0);
    const rows = matches.map((m) =>
      "<p><strong>" + String(m.number).padStart(2, "0") + " · " + esc(m.heading) +
      "</strong><span class=\"muted\"> — " + m.incoming + " incoming, " + m.existing + " existing</span></p>"
    ).join("");
    dialog.close();
    modal(
      "Review shot import",
      "<p><strong>" + previewResult.totalShots + " shots across " + matches.length +
        " matched scenes.</strong> Nothing has been imported yet.</p>" +
        '<div style="max-height:260px;overflow:auto">' + rows + "</div>" +
        (occupied
          ? '<label class="check-label"><input type="checkbox" name="append" value="yes"><span>Append to existing shots (may create duplicates if this file was imported before)</span></label>'
          : '<p class="muted">All matched scenes are empty; shots will be added in order.</p>') +
        '<textarea name="text" hidden>' + esc(source) + "</textarea>" +
        '<input type="hidden" name="expected" value="' +
        esc(JSON.stringify(matches.map((m) => ({ scene_id: m.scene_id, existing: m.existing })))) + '">',
      "shots-import-confirm",
    );
    dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent = "Import shots";
    return;
  }
  if (type === "shots-import-confirm") {
    const result = await request(
      url("projects/" + state.project!.id + "/import-shots"),
      "POST",
      {
        text: String(b.text || ""),
        mode: b.append === "yes" ? "append" : "empty",
        expected: JSON.parse(String(b.expected)),
      },
    );
    state.shot = result.firstShotId;
    state.tab = "shots";
    dialog.close();
    await loadWorkspace();
    notice("Imported " + result.imported + " shots into " + result.scenes + " scenes.");
    return;
  }
  if (type === "auth") {
    state.user = await request(
      form.dataset.setup === "true" ? "/api/auth/setup" : "/api/auth/login",
      "POST",
      b,
    );
    await init();
    return;
  }
  if (type === "info") {
    dialog.close();
    return;
  }
  if (type === "profile") {
    const p = await request("/api/profiles", "POST", b);
    state.profiles = await request("/api/profiles");
    state.profile = p.id;
    state.project = null;
    state.view = "projects";
    localStorage.setItem("mothlight-profile", p.id);
  }
  if (type === "profile-edit") {
    await request(`/api/profiles/${state.profile}`, "PATCH", b);
    state.profiles = await request("/api/profiles");
  }
  if (type === "project") {
    const newSeriesTitle = String(b.new_series_title || "").trim();
    delete b.new_series_title;
    if (newSeriesTitle) {
      // Resolve from the server: another tab may already have created the series.
      const latest = await request(url("workspace"));
      const match = latest.series.find(
        (series: R) => series.title.trim().toLocaleLowerCase() === newSeriesTitle.toLocaleLowerCase(),
      );
      if (match) {
        b.series_id = match.id;
      } else {
        const created = await request(url("series"), "POST", {
          title: newSeriesTitle,
          bible: "",
        });
        b.series_id = created.id;
      }
    }
    num("fps", "width", "height");
    b.series_id = b.series_id || null;
    const p = await request(
      url(`projects${rid ? "/" + rid : ""}`),
      rid ? "PATCH" : "POST",
      b,
    );
    state.project = await request(url(`projects/${p.id}/document`));
    state.view = "projects";
    state.tab = rid ? state.tab : "story";
  }
  if (type === "screenplay-import")
    await request(
      url(`projects/${state.project!.id}/import-screenplay`),
      "POST",
      b,
    );
  if (type === "series") {
    const title = String(b.title || "").trim();
    if (!title) throw new Error("Enter a series title.");
    const latest = await request(url("workspace"));
    const duplicate = !rid && latest.series.find(
      (series: R) => series.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase(),
    );
    if (duplicate) {
      dialog.close();
      await loadWorkspace();
      notice("Series “" + duplicate.title + "” already exists in this profile and is available in Film settings.");
      return;
    }
    const saved = await request(
      url(`series${rid ? "/" + rid : ""}`),
      rid ? "PATCH" : "POST",
      { title, bible: String(b.bible || "") },
    );
    // Do not report success until the active profile's workspace includes the record.
    const refreshed = await request(url("workspace"));
    if (!refreshed.series.some((series: R) => series.id === saved.id))
      throw new Error("Series was saved but is not visible in this profile. Refresh and check the selected profile.");
    dialog.close();
    await loadWorkspace();
    notice("Series “" + saved.title + "” " + (rid ? "updated" : "created") +
      " in " + (state.profiles.find((profile: R) => profile.id === state.profile)?.name || "this profile") +
      ". It is now available in Film settings.");
    return;
  }
  if (type === "asset")
    await request(
      url(`assets${rid ? "/" + rid : ""}`),
      rid ? "PATCH" : "POST",
      b,
    );
  if (type === "scene") {
    if (!rid) {
      b.project_id = state.project!.id;
      b.position = state.project!.scenes.length;
    }
    await request(
      url(`scenes${rid ? "/" + rid : ""}`),
      rid ? "PATCH" : "POST",
      b,
    );
  }
  if (type === "story")
    await request(url(`projects/${state.project!.id}`), "PATCH", b);
  if (type === "shot") {
    num("duration");
    await request(url(`shots/${state.shot}`), "PATCH", b);
  }
  if (type === "shot-assets")
    await request(url(`shots/${state.shot}/assets`), "PUT", {
      ids: values.getAll("asset"),
    });
  if (type === "shot-new") {
    num("duration");
    b.scene_id = form.dataset.scene;
    b.position = state.project!.scenes.find(
      (s: R) => s.id === b.scene_id,
    ).shots.length;
    const sh = await request(url("shots"), "POST", b);
    state.shot = sh.id;
    state.tab = "shots";
  }
  if (type === "take") {
    num("trim_in", "cost");
    await request(url(`takes/${rid}`), "PATCH", b);
  }
  if (type === "audio") {
    num("offset", "trim_in", "duration", "volume");
    await request(url(`audio_cues/${rid}`), "PATCH", b);
  }
  if (type === "delete") {
    await request(url(`${form.dataset.table}/${rid}`), "DELETE");
    if (state.shot === rid) state.shot = "";
  }
  if (type === "generate" || type === "generate-frames") {
    b.shot_id = state.shot;
    b.kind = type === "generate-frames" ? "image" : "video";
    const result = await request(url("jobs"), "POST", b);
    notice(type === "generate-frames"
      ? (result.queued === 2 ? "Storyboard and end-frame jobs queued." : "Frame generation queued.")
      : "Video generation queued.");
  }
  if (type === "member") await request(url("members"), "POST", b);
  if (type === "upload") {
    const upload = new FormData();
    upload.set("file", values.get("file")!);
    upload.set("localPath", b.localPath);
    const m = await request(url("media"), "POST", upload);
    const context = form.dataset.context;
    if (context === "storyboard" || context === "endframe")
      await request(url(`shots/${state.shot}`), "PATCH", {
        [context === "storyboard" ? "storyboard_id" : "end_frame_id"]: m.id,
        ...(context === "storyboard" && currentShot()?.status === "planned"
          ? { status: "storyboard" }
          : {}),
      });
    if (context === "asset-attachment")
      await request(url(`assets/${rid}/attachments`), "POST", {
        media_id: m.id,
        label: String(b.label || m.filename),
        notes: String(b.notes || ""),
      });
    if (context === "take") {
      delete b.file;
      delete b.localPath;
      num("cost", "trim_in");
      await request(url("takes"), "POST", {
        ...b,
        shot_id: state.shot,
        media_id: m.id,
      });
    }
    if (context === "audio") {
      delete b.file;
      delete b.localPath;
      num("offset", "trim_in", "duration", "volume");
      await request(url("audio_cues"), "POST", {
        ...b,
        project_id: state.project!.id,
        media_id: m.id,
      });
    }
  }
  dialog.close();
  await loadWorkspace();
  notice("Saved to your studio.");
}
const imageViewer = document.createElement("dialog");
let viewerImages: R[] = [];
let viewerIndex = 0;
function cycleViewer(direction: number) {
  if (viewerImages.length < 2) return;
  viewerIndex = (viewerIndex + direction + viewerImages.length) % viewerImages.length;
  const ref = viewerImages[viewerIndex];
  const image = imageViewer.querySelector<HTMLImageElement>("img")!;
  image.src = mediaUrl(ref.media_id);
  image.alt = ref.label || ref.filename || "Reference image";
  imageViewer.querySelector(".image-viewer-count")!.textContent = `${viewerIndex + 1} / ${viewerImages.length}`;
}
imageViewer.className = "image-viewer";
imageViewer.setAttribute("aria-label", "Full image preview");
document.body.append(imageViewer);
imageViewer.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".image-viewer-prev")) cycleViewer(-1);
  else if (target.closest(".image-viewer-next")) cycleViewer(1);
  else if (e.target === imageViewer || target.closest(".image-viewer-close"))
    imageViewer.close();
});
imageViewer.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    cycleViewer(e.key === "ArrowLeft" ? -1 : 1);
  }
});
imageViewer.addEventListener("close", () => {
  imageViewer.replaceChildren();
  viewerImages = [];
});

let coverTimer: ReturnType<typeof setTimeout> | undefined;
let hoveredCover: HTMLButtonElement | null = null;
function stopCoverPreview() {
  clearTimeout(coverTimer);
  hoveredCover = null;
}
app.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse" || e.buttons || imageViewer.open) return;
  const cover = (e.target as HTMLElement).closest<HTMLButtonElement>(".asset-cover");
  if (!cover || cover === hoveredCover) return;
  stopCoverPreview();
  const asset = state.workspace.assets.find((a: R) => a.id === cover.dataset.id);
  const images = asset ? assetImages(asset) : [];
  if (images.length < 2) return;
  hoveredCover = cover;
  const advance = () => {
    if (hoveredCover !== cover || !cover.isConnected) return;
    const index = (Number(cover.dataset.index || 0) + 1) % images.length;
    const next = new Image();
    next.onload = () => {
      if (hoveredCover !== cover || !cover.isConnected) return;
      next.className = "frame";
      next.alt = images[index].label || asset.name;
      cover.querySelector("img")!.replaceWith(next);
      cover.dataset.index = String(index);
      cover.querySelector(".asset-cover-count")!.textContent = `${index + 1} / ${images.length}`;
      coverTimer = setTimeout(advance, 650);
    };
    next.src = mediaUrl(images[index].media_id);
  };
  coverTimer = setTimeout(advance, 650);
});
app.addEventListener("pointerout", (e) => {
  if (hoveredCover && !(e.relatedTarget instanceof Node && hoveredCover.contains(e.relatedTarget)))
    stopCoverPreview();
});
app.addEventListener("pointerdown", stopCoverPreview);
window.addEventListener("blur", stopCoverPreview);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCoverPreview();
});

document.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el) return;
  e.preventDefault();
  if (el instanceof HTMLButtonElement && el.disabled) return;
  try {
    await action(el);
  } catch (e) {
    notice((e as Error).message, true);
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target as HTMLFormElement;
  if (!form.dataset.form) return;
  e.preventDefault();
  const btn = form.querySelector<HTMLButtonElement>(
    'button[type="submit"],button:not([type]):not([data-action])',
  );
  if (btn) btn.disabled = true;
  try {
    await submit(form);
  } catch (e) {
    notice((e as Error).message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
});
let attachmentPreviewUrl: string | undefined;
function clearAttachmentPreview() {
  if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
  attachmentPreviewUrl = undefined;
}
function updateAttachmentPreview(input: HTMLInputElement) {
  clearAttachmentPreview();
  const preview = dialog.querySelector<HTMLImageElement>(".attachment-preview");
  const selection = dialog.querySelector<HTMLElement>(".attachment-selection");
  if (!preview || !selection) return;
  const file = input.files?.[0];
  selection.textContent = file ? `Selected: ${file.name}` : "";
  preview.hidden = true;
  preview.removeAttribute("src");
  if (file?.type.startsWith("image/") && file.type !== "image/svg+xml") {
    attachmentPreviewUrl = URL.createObjectURL(file);
    preview.src = attachmentPreviewUrl;
    preview.hidden = false;
  }
}
dialog.addEventListener("close", clearAttachmentPreview);
dialog.addEventListener("paste", (e) => {
  const input = dialog.querySelector<HTMLInputElement>('form[data-context="asset-attachment"] input[name="file"]');
  if (!input) return;
  const file = Array.from(e.clipboardData?.items || [])
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
  if (!file) return;
  e.preventDefault();
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  updateAttachmentPreview(input);
});
dialog.addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  if (input.closest('form[data-form="generate-frames"]') && input.name === "provider") {
    dialog.querySelector("#image-generation-options")!.innerHTML = frameGenerationFields(input.value);
  }
  if (input.closest('form[data-form="generate"]')) {
    if (input.name === "provider")
      dialog.querySelector("#generation-options")!.innerHTML = generationFields(input.value);
    updateSeedanceFields();
  }
  if (input.name === "file") updateAttachmentPreview(input);
  if (!["shots-import-file", "assets-import-file"].includes(input.id) || !input.files?.length) return;
  const file = input.files[0];
  if (file.size > 1_000_000) {
    notice("Import file must be 1 MB or smaller.", true);
    input.value = "";
    return;
  }
  const textarea = dialog.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
  if (textarea) textarea.value = await file.text();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
await init();

export {};
