import { db, all, one, run, id, dataDir, type Row } from "./db";
import { join } from "node:path";
import { mkdir, copyFile, rm } from "node:fs/promises";
import { timecode } from "./export";
import { requireValue } from "./auth";
import { mediaPath, execProcess } from "./worker";
import { availableSeedanceModels, seedanceConfigured, seedanceOptions } from "./seedance";
import { IMAGE_MODELS, imageConfigured } from "./images";

const reply = (data: unknown, status = 200) => Response.json(data, { status });
function projectFor(projectId: string, profileId: string) {
  const project = one("SELECT * FROM projects WHERE id=? AND profile_id=?", projectId, profileId);
  requireValue(project, "Project not found.", 404);
  return project;
}
function takeFor(takeId: string, profileId: string) {
  const take = one("SELECT t.* FROM v2_takes t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.profile_id=?", takeId, profileId);
  requireValue(take, "Take not found.", 404);
  return take;
}
function docLines(doc: any): { id: string; text: string }[] {
  requireValue(doc?.type === "doc" && Array.isArray(doc.content) && doc.content.length > 0 && doc.content.length <= 20000, "Invalid screenplay.");
  const seen = new Set<string>();
  return doc.content.map((node: any) => {
    requireValue(node?.type === "screenplayLine" && typeof node.attrs?.lineId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(node.attrs.lineId), "Invalid screenplay line.");
    requireValue(!seen.has(node.attrs.lineId), "Duplicate screenplay line.");
    seen.add(node.attrs.lineId);
    requireValue(!node.content || Array.isArray(node.content), "Invalid line content.");
    const pieces = node.content || [];
    requireValue(pieces.every((p: any) => p?.type === "text" && typeof p.text === "string" && !p.text.includes("\n")), "Screenplay lines must contain plain text.");
    const text = pieces.map((p: any) => p.text).join("");
    requireValue(text.length <= 20000, "Screenplay line too long.");
    return { id: node.attrs.lineId, text };
  });
}
function fromText(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return { type: "doc", content: lines.map(line => ({
    type: "screenplayLine", attrs: { lineId: crypto.randomUUID() },
    ...(line ? { content: [{ type: "text", text: line }] } : {}),
  })) };
}
function initialDoc(projectId: string) {
  const scenes = all("SELECT heading,screenplay FROM scenes WHERE project_id=? ORDER BY position,id", projectId);
  return fromText(scenes.length ? scenes.map(s => s.heading + "\n" + s.screenplay).join("\n\n") : "");
}
function getScreenplay(projectId: string) {
  const row = one("SELECT * FROM v2_screenplays WHERE project_id=?", projectId);
  if (row) return { document: JSON.parse(row.document_json), revision: row.revision as number };
  run("INSERT OR IGNORE INTO v2_screenplays(project_id,document_json,revision) VALUES(?,?,0)", projectId, JSON.stringify(initialDoc(projectId)));
  const stored = one("SELECT * FROM v2_screenplays WHERE project_id=?", projectId)!;
  return { document: JSON.parse(stored.document_json), revision: stored.revision as number };
}
function activeLines(projectId: string) {
  return new Set(docLines(getScreenplay(projectId).document).map(line => line.id));
}
function mediaFor(mediaId: string, profileId: string) {
  const m = one("SELECT * FROM media WHERE id=? AND profile_id=?", mediaId, profileId);
  requireValue(m && m.mime.startsWith("image/") && m.mime !== "image/svg+xml", "Reference must be an image in this profile.");
  return m;
}
function deserializeTake(row: Row) {
  return { ...row, options: JSON.parse(row.options_json), referenceIds: JSON.parse(row.reference_ids_json),
    includeInCut: !!row.include_in_cut };
}
function requireDraft(row: Row) {
  requireValue(!row.media_id && row.status !== "queued", "Generated or queued takes are immutable. Fork to change generation inputs.", 409);
}
function referenceInput(row: Row, pid: string, project: Row) {
  const refs: Row[] = JSON.parse(row.reference_ids_json).map((mid: string) => mediaFor(mid, pid));
  const style = row.style_asset_id
    ? one("SELECT * FROM assets WHERE id=? AND profile_id=? AND kind='style'", row.style_asset_id, pid)
    : null;
  const assets = refs.map((m, i) => ({ name: "Storyboard " + (i + 1),
    attachments: [{ mime: m.mime, localPath: mediaPath(m), filename: m.filename, label: m.filename }] }));
  return {
    project: { ...project, style: style ? [style.description,style.prompt,style.continuity].filter(Boolean).join("\n") : "" },
    shot: { title: "Screenplay take", duration: Number(JSON.parse(row.options_json).duration || 8),
      action: "", dialogue: "", camera: "", continuity: "", negative_prompt: "" },
    assets,
    firstFrame: refs[0] ? mediaPath(refs[0]) : null,
    lastFrame: refs[1] ? mediaPath(refs[1]) : null,
  };
}
export async function v2Api(req: Request, parts: string[], pid: string): Promise<Response> {
  // Mounted AFTER the existing session + profile membership authorization.
  const method = req.method;
  if (parts[1] === "projects" && parts[2]) {
    const project = projectFor(parts[2], pid);
    if (parts.length === 3 && method === "GET") {
      const screenplay = getScreenplay(project.id);
      return reply({ ...screenplay, takes: all("SELECT * FROM v2_takes WHERE project_id=? ORDER BY sort_order,created_at,id", project.id).map(deserializeTake) });
    }
    if (parts[3] === "export" && method === "GET") {
      const doc = getScreenplay(project.id).document;
      const lines = docLines(doc);
      const rows = all("SELECT t.*, m.filename, m.stored_name FROM v2_takes t LEFT JOIN media m ON m.id=t.media_id WHERE t.project_id=? AND t.include_in_cut=1 AND t.media_id IS NOT NULL",project.id);
      const selected = lines.flatMap(line => rows.filter(t=>t.anchor_line_id===line.id)
        .sort((a,b)=>a.sort_order-b.sort_order || a.id.localeCompare(b.id)));
      requireValue(selected.length > 0, "Include at least one generated take before exporting.",409);
      requireValue(selected.length <= 999, "EDL supports up to 999 events in one handoff.");
      const fps = project.fps;
      let cursor = fps * 3600;
      const events: string[] = ["TITLE: " + String(project.title).replace(/[\r\n]/g," "), "FCM: NON-DROP FRAME", ""];
      const manifest: Row[] = [];
      const directory = join(dataDir,"work","v2-export-"+id());
      await mkdir(join(directory,"media"),{recursive:true});
      try {
        for (let i=0; i<selected.length; i++) {
          const take = selected[i];
          const seconds = Number(JSON.parse(take.options_json).duration || 8);
          const frames = Math.max(1,Math.round(seconds*fps));
          const reel = "ML" + String(i+1).padStart(6,"0");
          const dest = reel + "-" + take.stored_name;
          events.push(String(i+1).padStart(3,"0") + "  " + reel + " V     C        " +
            timecode(0,fps) + " " + timecode(frames,fps) + " " + timecode(cursor,fps) + " " + timecode(cursor+frames,fps),
            "* FROM CLIP NAME: " + dest, "* TAKE: " + take.id, "");
          manifest.push({takeId:take.id,reel,media:"media/"+dest,originalFilename:take.filename,
            durationSeconds:seconds,recordStartFrames:cursor,recordEndFrames:cursor+frames});
          const m = one("SELECT * FROM media WHERE id=?",take.media_id)!;
          await copyFile(mediaPath(m),join(directory,"media",dest));
          cursor += frames;
        }
        const script = lines.map(l=>l.text).join("\n");
        await Bun.write(join(directory,"screenplay.fountain"),script);
        await Bun.write(join(directory,"timeline.edl"),events.join("\n"));
        await Bun.write(join(directory,"manifest.json"),JSON.stringify({
          title:project.title,fps,notes:"Straight cuts in screenplay/tile order. Embedded audio remains in source clips; finish in Resolve.",
          clips:manifest
        },null,2));
        await execProcess(["zip","-q","-r","handoff.zip","timeline.edl","screenplay.fountain","manifest.json","media"],{cwd:directory});
        const archive = await Bun.file(join(directory,"handoff.zip")).arrayBuffer();
        return new Response(archive,{headers:{"Content-Type":"application/zip","Content-Disposition":'attachment; filename="mothlight-v2-handoff.zip"'}});
      } finally { await rm(directory,{recursive:true,force:true}); }
    }
    if (parts[3] === "screenplay" && method === "PUT") {
      const b = await req.json();
      requireValue(JSON.stringify(b.document).length <= 2_000_000, "Screenplay exceeds 2 MB.");
      const next = docLines(b.document);
      requireValue(Number.isInteger(b.revision) && b.revision >= 0, "Invalid screenplay revision.");
      const saved = db.transaction(() => {
        const previous = getScreenplay(project.id);
        requireValue(previous.revision === b.revision, "Screenplay changed elsewhere. Reload before saving.", 409);
        const oldLines = docLines(previous.document).map(x => x.id);
        const newIds = new Set(next.map(x => x.id));
        const fallback = (oldId: string) => {
          const index = oldLines.indexOf(oldId);
          if (index === -1) return next[0].id;
          for (let i = index - 1; i >= 0; i--) if (newIds.has(oldLines[i])) return oldLines[i];
          for (let i = index + 1; i < oldLines.length; i++) if (newIds.has(oldLines[i])) return oldLines[i];
          return next[0].id;
        };
        for (const take of all("SELECT id,anchor_line_id FROM v2_takes WHERE project_id=?", project.id)) {
          if (!newIds.has(take.anchor_line_id))
            run("UPDATE v2_takes SET anchor_line_id=?,sort_order=1000000+sort_order WHERE id=?", fallback(take.anchor_line_id), take.id);
        }
        run("INSERT INTO v2_screenplays(project_id,document_json,revision) VALUES(?,?,1) ON CONFLICT(project_id) DO UPDATE SET document_json=excluded.document_json,revision=revision+1,updated_at=CURRENT_TIMESTAMP",
          project.id, JSON.stringify(b.document));
        run("UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?", project.id);
        return one("SELECT revision FROM v2_screenplays WHERE project_id=?", project.id)!.revision;
      })();
      return reply({ revision: saved });
    }
    if (parts[3] === "takes" && parts.length === 4 && method === "POST") {
      const b = await req.json();
      requireValue(typeof b.lineId === "string" && activeLines(project.id).has(b.lineId), "Choose an existing screenplay line.");
      const takeId = id();
      const order = Number(one("SELECT COALESCE(MAX(sort_order),-1)+1 AS value FROM v2_takes WHERE project_id=? AND anchor_line_id=?", project.id,b.lineId)!.value);
      run("INSERT INTO v2_takes(id,project_id,anchor_line_id,sort_order,options_json) VALUES(?,?,?,?,?)",
        takeId, project.id, b.lineId, order, JSON.stringify({ duration: 8, ratio: "9:16", resolution: "720p", audio: false, mode: "references" }));
      return reply(deserializeTake(takeFor(takeId, pid)), 201);
    }
    if (parts[3] === "reorder" && method === "POST") {
      const b = await req.json();
      requireValue(Array.isArray(b.items) && b.items.length <= 10000, "Invalid take ordering.");
      const existing = all("SELECT id FROM v2_takes WHERE project_id=?", project.id);
      const ids = existing.map(x=>x.id).sort();
      requireValue(b.items.length === ids.length, "All takes must be included in reordering.");
      const seen = new Set<string>(), counts = new Map<string,number>(), lineIds = activeLines(project.id);
      for (const item of b.items) {
        requireValue(typeof item.id === "string" && ids.includes(item.id) && !seen.has(item.id) && lineIds.has(item.lineId), "Invalid take or target line.");
        seen.add(item.id);
      }
      db.transaction(() => {
        for (const item of b.items) {
          const order = counts.get(item.lineId) || 0;
          run("UPDATE v2_takes SET anchor_line_id=?,sort_order=? WHERE id=?",item.lineId,order,item.id);
          counts.set(item.lineId,order+1);
        }
      })();
      return reply({ ok: true });
    }
  }
  if (parts[1] === "takes" && parts[2]) {
    const take = takeFor(parts[2], pid);
    const project = projectFor(take.project_id, pid);
    if (parts.length === 3 && method === "GET") return reply(deserializeTake(take));
    if (parts.length === 3 && method === "PATCH") {
      const b = await req.json();
      if ("includeInCut" in b) {
        requireValue(typeof b.includeInCut === "boolean", "Invalid inclusion flag.");
        run("UPDATE v2_takes SET include_in_cut=? WHERE id=?", b.includeInCut ? 1:0,take.id);
      }
      if (["provider","model","prompt","options","referenceIds","styleAssetId"].some(k => k in b)) {
        requireDraft(take);
        const provider = b.provider ?? take.provider;
        const model = b.model ?? take.model;
        const prompt = b.prompt ?? take.prompt;
        const options = b.options ?? JSON.parse(take.options_json);
        const refs = b.referenceIds ?? JSON.parse(take.reference_ids_json);
        const styleId = b.styleAssetId === undefined ? take.style_asset_id : b.styleAssetId;
        requireValue(["byteplus","custom"].includes(provider), "Video takes require Seedance or the local video adapter.");
        requireValue(typeof model === "string" && model.length < 200 && typeof prompt === "string" && prompt.length <= 100000, "Invalid model or prompt.");
        requireValue(options && typeof options === "object" && !Array.isArray(options), "Invalid generation settings.");
        requireValue(Array.isArray(refs) && refs.length <= 30 && refs.every((x: unknown)=>typeof x === "string"), "Invalid storyboard references.");
        refs.forEach((m: string)=>mediaFor(m,pid));
        if (styleId !== null) {
          requireValue(one("SELECT id FROM assets WHERE id=? AND profile_id=? AND kind='style'", styleId,pid), "Style not found.");
        }
        run("UPDATE v2_takes SET provider=?,model=?,prompt=?,options_json=?,reference_ids_json=?,style_asset_id=? WHERE id=?",
          provider,model,prompt,JSON.stringify(options),JSON.stringify(refs),styleId,take.id);
      }
      return reply(deserializeTake(takeFor(take.id,pid)));
    }
    if (parts.length === 3 && method === "DELETE") {
      requireValue(take.status !== "queued", "Cannot delete a queued take.",409);
      run("DELETE FROM v2_takes WHERE id=?", take.id);
      return reply({ok:true});
    }
    if (parts[3] === "fork" && method === "POST") {
      const newId = id();
      const nextOrder = Number(one("SELECT COALESCE(MAX(sort_order),-1)+1 AS value FROM v2_takes WHERE project_id=? AND anchor_line_id=?",project.id,take.anchor_line_id)!.value);
      run("INSERT INTO v2_takes(id,project_id,anchor_line_id,sort_order,provider,model,prompt,options_json,reference_ids_json,style_asset_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
        newId,project.id,take.anchor_line_id,nextOrder,take.provider,take.model,take.prompt,take.options_json,take.reference_ids_json,take.style_asset_id);
      return reply(deserializeTake(takeFor(newId,pid)),201);
    }
    if (parts[3] === "import-video" && method === "POST") {
      requireDraft(take);
      const b = await req.json();
      const m = one("SELECT * FROM media WHERE id=? AND profile_id=?",b.mediaId,pid);
      requireValue(m && m.mime.startsWith("video/"),"Choose a video from this profile.");
      run("UPDATE v2_takes SET media_id=?,status='completed' WHERE id=?",m.id,take.id);
      return reply(deserializeTake(takeFor(take.id,pid)));
    }
    if (parts[3] === "generate" && method === "POST") {
      requireDraft(take);
      requireValue(take.prompt.trim(), "Enter a descriptive prompt before generation.");
      const provider = take.provider;
      requireValue(provider === "byteplus" ? seedanceConfigured() : !!process.env.MOTHLIGHT_GENERATOR,
        "Configure the selected generation service in settings.",409);
      const input: Row = referenceInput(take,pid,project);
      input.v2TakeId = take.id;
      if (provider === "byteplus") {
        const settings = JSON.parse(take.options_json);
        if (!JSON.parse(take.reference_ids_json).length && settings.mode === "references") settings.mode = "text";
        input.seedance = seedanceOptions(take.model, settings, input);
      }
      const jid = id();
      db.transaction(() => {
        run("INSERT INTO jobs(id,profile_id,project_id,kind,provider,model,prompt,input_json) VALUES(?,?,?,?,?,?,?,?)",
          jid,pid,project.id,"video",provider,take.model,take.prompt,JSON.stringify(input));
        run("UPDATE v2_takes SET job_id=?,status='queued' WHERE id=?",jid,take.id);
      })();
      return reply({ id:jid, status:"queued" },202);
    }
    if (parts[3] === "generate-frame" && method === "POST") {
      requireDraft(take);
      const b = await req.json();
      requireValue((b.provider === "openai" || b.provider === "google") && imageConfigured(b.provider), "Configure an image generator.",409);
      requireValue(IMAGE_MODELS[b.provider as "openai" | "google"].some(m=>m.id===b.model), "Invalid image model.");
      requireValue(typeof b.prompt === "string" && b.prompt.trim() && b.prompt.length < 100000, "Storyboard prompt required.");
      const input: Row = { ...referenceInput(take,pid,project), v2TakeId:take.id, frameTarget:"storyboard" };
      const jid = id();
      run("INSERT INTO jobs(id,profile_id,project_id,kind,provider,model,prompt,input_json) VALUES(?,?,?,?,?,?,?,?)",
        jid,pid,project.id,"image",b.provider,b.model,b.prompt,JSON.stringify(input));
      return reply({id:jid,status:"queued"},202);
    }
  }
  return reply({error:"Not found."},404);
}
