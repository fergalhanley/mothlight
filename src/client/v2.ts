import { Editor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tiptap/extension-unique-id";

type Row = Record<string, any>;
type Context = { profileId: string; project: Row; workspace: Row; readonly: boolean };
let editor: Editor | null = null;
let ctx: Context | null = null;
let revision = 0;
let takes: Row[] = [];
let nodeViews = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending = false, saving = false, loaded = false, current: Row | null = null;
let stagedRefs: string[] = [], dragTake: string | null = null, pollTimer: ReturnType<typeof setInterval> | undefined;
const byId = (id: string) => document.getElementById(id);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g,
  ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const endpoint = (path: string) => "/api/profiles/" + ctx!.profileId + "/" + path;
const v2path = (path: string) => endpoint("v2/" + path);
const projectPath = () => v2path("projects/" + ctx!.project.id);
const media = (id: string) => endpoint("media/" + id);
async function send(path: string, method = "GET", payload?: any) {
  const response = await fetch(path, { method, headers: payload instanceof FormData ? {} :
    payload !== undefined ? { "Content-Type": "application/json" } : {},
    body: payload instanceof FormData ? payload : payload !== undefined ? JSON.stringify(payload) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function alertError(error: unknown) {
  const target = byId("v2-status");
  if (target) { target.textContent = (error as Error).message; target.classList.add("error"); }
}
function setStatus(value: string) {
  const target = byId("v2-status");
  if (target) { target.textContent = value; target.classList.remove("error"); }
}
function lineIds() {
  if (!editor) return [] as string[];
  const ids: string[] = [];
  editor.state.doc.forEach(node => { if (node.type.name === "screenplayLine") ids.push(node.attrs.lineId as string); });
  return ids;
}
function takeList(lineId: string) {
  return takes.filter(t => t.anchor_line_id === lineId)
    .sort((a,b) => Number(a.sort_order) - Number(b.sort_order) || a.created_at.localeCompare(b.created_at));
}
function thumbnail(t: Row) {
  if (!t.media_id) {
    const id = t.referenceIds?.[0];
    return id ? '<img src="' + media(id) + '" alt="Storyboard reference">' : '<span class="v2-placeholder">◇</span>';
  }
  return '<video src="' + media(t.media_id) + '#t=0.1" muted playsinline preload="metadata"></video>';
}
function tile(t: Row) {
  const immutable = !!t.media_id || t.status === "queued";
  const status = t.status === "completed" ? "Video ready" : t.status === "queued" ? "Generating…" : t.status === "failed" ? "Failed" : "Draft";
  return '<div class="v2-tile" draggable="' + (!ctx!.readonly) + '" data-take="' + escapeHtml(t.id) + '">' +
    '<span class="v2-drag" title="Drag to reorder">⠿</span>' +
    '<div class="v2-tile-thumb">' + thumbnail(t) + '</div>' +
    '<div class="v2-tile-info"><strong>' + escapeHtml(status) + '</strong><small>' +
      escapeHtml((t.options?.duration || 8) + 's · ' + (t.model || "No model")) + '</small></div>' +
    '<div class="v2-tile-actions">' +
    '<button type="button" data-v2="open" data-id="' + t.id + '" title="' + (immutable ? "View take" : "Edit take") + '">' + (immutable ? "◉" : "✎") + '</button>' +
    (!ctx!.readonly ? '<button type="button" data-v2="fork" data-id="' + t.id + '" title="Fork take">⑂</button>' +
      '<button type="button" data-v2="remove" data-id="' + t.id + '" title="Delete take">×</button>' : '') +
    '</div></div>';
}
function paint() { for (const draw of nodeViews) draw(); }
const ScreenplayLine = Node.create({
  name: "screenplayLine",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() { return { lineId: { default: null, parseHTML: el => el.getAttribute("data-line-id"),
    renderHTML: attrs => ({ "data-line-id": attrs.lineId }) } }; },
  parseHTML() { return [{tag:"div[data-screenplay-line]"}, {tag:"p"}]; },
  renderHTML({HTMLAttributes}) { return ["div",mergeAttributes(HTMLAttributes,{"data-screenplay-line":"true"}),0]; },
  addNodeView() {
    return ({ node }) => {
      let lineId = node.attrs.lineId as string;
      const outer = document.createElement("div");
      outer.className = "v2-line";
      const content = document.createElement("div");
      content.className = "v2-line-text";
      const aside = document.createElement("div");
      aside.className = "v2-line-aside";
      aside.contentEditable = "false";
      outer.append(content,aside);
      const render = () => {
        aside.dataset.lineId = lineId || "";
        aside.innerHTML = takeList(lineId).map(tile).join("") +
          (!ctx?.readonly ? '<button type="button" class="v2-line-add" title="Add take" data-v2="add" data-line="' +
           escapeHtml(lineId) + '">+</button>' : '');
      };
      nodeViews.add(render);
      render();
      return { dom: outer, contentDOM: content,
        stopEvent(event: Event) { return event.target instanceof Element && !!event.target.closest(".v2-line-aside"); },
        update(next: any) {
          if (next.type.name !== "screenplayLine") return false;
          if (lineId !== next.attrs.lineId) { lineId = next.attrs.lineId; render(); }
          return true;
        },
        destroy() { nodeViews.delete(render); },
      };
    };
  },
});
const session = () => ctx && { project: ctx.project.id, profile: ctx.profileId };
let mountKey = 0;
export function unmountScreenplayV2() {
  mountKey++;
  if (saveTimer) clearTimeout(saveTimer);
  if (pending && !saving && editor && ctx) void flushSave();
  if (pollTimer) clearInterval(pollTimer);
  // Save in-flight requests finish independently; the next mount reloads persisted state.
  editor?.destroy(); editor = null; nodeViews.clear(); loaded = false; ctx = null; current = null;
  const modal = byId("v2-take-dialog") as HTMLDialogElement | null;
  if (modal?.open) modal.close();
}
export async function mountScreenplayV2(host: HTMLElement, context: Context) {
  const key = ++mountKey;
  ctx = context; loaded = false; pending = false; saving = false;
  host.innerHTML = '<div class="v2-heading"><div><h2>Screenplay</h2><p>Write freely. Attach and rearrange generated takes beside any line.</p></div>' +
    '<div class="v2-toolbar"><span id="v2-status">Loading…</span><label class="v2-import-script">Import Fountain<input id="v2-fountain" type="file" accept=".fountain,.txt,text/plain" hidden></label><button type="button" id="v2-refresh">Refresh takes</button>' +
    '<button type="button" id="v2-export">Resolve handoff ↗</button></div></div><div id="v2-editor"></div>';
  try {
    const data = await send(projectPath());
    if (key !== mountKey || !host.isConnected) return;
    revision = data.revision; takes = data.takes;
    editor = new Editor({
      element: byId("v2-editor")!,
      extensions: [
        StarterKit.configure({ paragraph: false, heading:false, bulletList:false, orderedList:false,
          listItem:false, blockquote:false, codeBlock:false, horizontalRule:false }),
        ScreenplayLine,
        UniqueID.configure({ types:["screenplayLine"], attributeName:"lineId" }),
      ],
      content: data.document,
      editable: !context.readonly,
      editorProps: { attributes: { class:"v2-screenplay-prosemirror", spellcheck:"true" } },
      onUpdate: () => { if (loaded) scheduleSave(); },
      onBlur: () => { if (pending) void flushSave(); },
    });
    loaded = true;
    setStatus("Saved");
    host.addEventListener("click", onHostClick);
    host.addEventListener("dragstart", onDragStart);
    host.addEventListener("dragend", () => { dragTake=null; document.querySelectorAll(".v2-drop-target").forEach(el=>el.classList.remove("v2-drop-target")); });
    host.addEventListener("dragover", onDragOver);
    host.addEventListener("dragleave", onDragLeave);
    host.addEventListener("drop", onDrop);
    byId("v2-refresh")?.addEventListener("click", () => void refreshTakes());
    byId("v2-fountain")?.addEventListener("change",async event=>{
      const input=event.target as HTMLInputElement;
      const file=input.files?.[0];
      if (!file || !editor) return;
      try {
        if (file.size > 1_000_000) throw new Error("Screenplay file must be under 1 MB.");
        if (!confirm("Replace the screenplay text with this file? Existing takes will reanchor to surviving lines.")) return;
        const lines=(await file.text()).replace(/\r\n?/g,"\n").split("\n");
        editor.commands.setContent({type:"doc",content:lines.map(text=>({
          type:"screenplayLine",attrs:{lineId:crypto.randomUUID()},
          ...(text?{content:[{type:"text",text}]}:{})
        }))});
        scheduleSave();
      } catch(error){alertError(error);}
      finally {input.value="";}
    });
    byId("v2-export")?.addEventListener("click", () => { void exportSequence(); });
    pollTimer = setInterval(() => { if (ctx && takes.some(t=>t.status==="queued")) void refreshTakes(); },7000);
  } catch(e) { alertError(e); }
}
function scheduleSave() {
  pending = true; setStatus("Unsaved changes");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushSave(); },500);
}
async function flushSave() {
  if (saving || !pending || !editor || !ctx) return;
  saving = true; pending = false;
  const key = mountKey;
  const doc = editor.getJSON();
  try {
    const data = await send(projectPath() + "/screenplay", "PUT", { document:doc, revision });
    if (key !== mountKey) return;
    revision = data.revision;
    if (!pending) setStatus("Saved");
    await refreshTakes(false);
  } catch(e) { if (key===mountKey) alertError(e); }
  finally {
    saving = false;
    if (pending && key===mountKey) scheduleSave();
  }
}
async function refreshTakes(showStatus = true) {
  if (!ctx) return;
  const key = mountKey;
  const data = await send(projectPath());
  if (key !== mountKey) return;
  takes = data.takes;
  // Reload only take records, never replace an actively edited screenplay.
  paint();
  if (showStatus) setStatus("Takes refreshed");
}
function onHostClick(e: MouseEvent) {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-v2]");
  if (!button) return;
  e.preventDefault(); e.stopPropagation();
  const action = button.dataset.v2!, id = button.dataset.id || "";
  void (async () => {
    try {
      if (action === "add") {
        if (pending || saving) await flushSave();
        const t = await send(projectPath() + "/takes", "POST", {lineId:button.dataset.line});
        takes.push(t); paint(); openDialog(t);
      } else if (action === "open") openDialog(takes.find(t=>t.id===id)!);
      else if (action === "fork") {
        const t = await send(v2path("takes/" + id + "/fork"),"POST",{});
        takes.push(t); paint(); openDialog(t);
      } else if (action === "remove" && confirm("Delete this take? Its original media remains in the media shelf.")) {
        await send(v2path("takes/" + id),"DELETE");
        takes = takes.filter(t=>t.id!==id); paint();
      }
    } catch(error) { alertError(error); }
  })();
}
function onDragStart(e: DragEvent) {
  const tile = (e.target as HTMLElement).closest<HTMLElement>(".v2-tile");
  if (!tile || ctx?.readonly) return;
  dragTake = tile.dataset.take || null;
  e.dataTransfer?.setData("text/plain",dragTake || "");
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(e: DragEvent) {
  const aside = (e.target as HTMLElement).closest<HTMLElement>(".v2-line-aside");
  if (!aside || !dragTake) return;
  e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  aside.classList.add("v2-drop-target");
}
function onDragLeave(e: DragEvent) {
  const aside = (e.target as HTMLElement).closest<HTMLElement>(".v2-line-aside");
  if (aside && !(e.relatedTarget instanceof window.Node && aside.contains(e.relatedTarget)))
    aside.classList.remove("v2-drop-target");
}
async function onDrop(e: DragEvent) {
  const aside = (e.target as HTMLElement).closest<HTMLElement>(".v2-line-aside");
  document.querySelectorAll(".v2-drop-target").forEach(el=>el.classList.remove("v2-drop-target"));
  if (!aside || !dragTake || !ctx || !editor) return;
  e.preventDefault();
  const targetId = aside.dataset.lineId!, moving = takes.find(t=>t.id===dragTake);
  dragTake = null;
  if (!moving || !lineIds().includes(targetId)) return;
  const target = (e.target as HTMLElement).closest<HTMLElement>(".v2-tile");
  const remaining = takeList(targetId).filter(t=>t.id!==moving.id);
  const index = target ? Math.max(0,remaining.findIndex(t=>t.id===target.dataset.take) +
    (e.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2 ? 1 : 0)) : remaining.length;
  const groups = new Map<string,Row[]>();
  for (const line of lineIds()) groups.set(line,takeList(line).filter(t=>t.id!==moving.id));
  const destination = groups.get(targetId)!;
  destination.splice(Math.min(index,destination.length),0,moving);
  const items = Array.from(groups).flatMap(([lineId,group])=>group.map((take,order)=>({id:take.id,lineId,order})));
  const snapshot = takes.map(t=>({...t}));
  for (const item of items) {
    const t = takes.find(t=>t.id===item.id)!;
    t.anchor_line_id=item.lineId; t.sort_order=item.order;
  }
  paint();
  try { await send(projectPath()+"/reorder","POST",{items}); setStatus("Takes reordered"); }
  catch(error) { takes=snapshot;paint();alertError(error); }
}
function modelOptions(provider: string, selected: string) {
  const models: Row[] = provider === "byteplus" ? ctx!.workspace.seedanceModels : [];
  if (provider==="custom") return '<option value="custom">Local adapter</option>';
  return models.map(m=>'<option value="'+escapeHtml(m.id)+'"'+(m.id===selected?' selected':'')+'>'+escapeHtml(m.name)+'</option>').join("");
}
function imageOptionRows() {
  return (ctx!.workspace.assets || []).map((asset:Row)=>{
    const ids = [asset.media_id,...(asset.attachments || []).filter((a:Row)=>a.mime?.startsWith("image/") && a.mime !== "image/svg+xml").map((a:Row)=>a.media_id)]
      .filter(Boolean);
    return '<div class="v2-world-row"><span>'+escapeHtml(asset.kind+' · '+asset.name)+'</span><div>'+
      ids.map((id:string)=>'<button type="button" data-ref="'+escapeHtml(id)+'" title="Use asset reference"><img src="'+media(id)+'" alt="'+escapeHtml(asset.name)+'"></button>').join("")+
      '</div></div>';
  }).join("");
}
function references() {
  const view = byId("v2-references");
  if (!view) return;
  view.innerHTML = stagedRefs.map((id,index)=>'<div class="v2-reference"><img src="'+media(id)+'" alt="Reference '+(index+1)+'">' +
    '<button type="button" data-ref-remove="'+index+'" title="Remove reference">×</button>' +
    (index>0?'<button type="button" data-ref-left="'+index+'" title="Move left">←</button>':'')+'</div>').join("") +
    '<label class="v2-upload-drop">+ Image<input type="file" id="v2-file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>';
}
function modal() {
  let dialog = byId("v2-take-dialog") as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "v2-take-dialog"; dialog.className = "v2-modal";
    document.body.append(dialog);
    dialog.addEventListener("click",onModalClick);
    dialog.addEventListener("change",onModalChange);
    dialog.addEventListener("submit",onModalSubmit);
    dialog.addEventListener("paste",onModalPaste);
    dialog.addEventListener("dragover",event=> { if ((event.target as HTMLElement).closest("#v2-references")) event.preventDefault(); });
    dialog.addEventListener("drop",event=> { if ((event.target as HTMLElement).closest("#v2-references")) {
      event.preventDefault(); void addFiles(Array.from(event.dataTransfer?.files || [])); } });
  }
  return dialog;
}
function openDialog(t: Row) {
  current = t; stagedRefs = [...(t.referenceIds || [])];
  const locked = !!t.media_id || t.status==="queued" || ctx!.readonly;
  const attrs = locked ? " disabled" : "";
  const options = t.options || {};
  const styleOptions = '<option value="">None</option>' + (ctx!.workspace.assets || [])
    .filter((a:Row)=>a.kind==="style").map((a:Row)=>'<option value="'+escapeHtml(a.id)+'"'+(t.style_asset_id===a.id?' selected':'')+'>'+escapeHtml(a.name)+'</option>').join("");
  const frameProvider = ctx!.workspace.imageProviders?.google ? "google" :
    ctx!.workspace.imageProviders?.openai ? "openai" : "";
  const frameModels = ctx!.workspace.imageModels?.[frameProvider] || [];
  const frameSelect = '<label>Image provider<select name="frameProvider"' + attrs + '>' +
    ["google","openai"].filter(p=>ctx!.workspace.imageProviders?.[p])
      .map(p=>'<option value="'+p+'"'+(frameProvider===p?' selected':'')+'>'+({google:"Nano Banana · Google",openai:"GPT Image · OpenAI"} as Row)[p]+'</option>').join("") +
    '</select></label><label>Model<select name="frameModel"' + attrs + '>' +
    frameModels.map((m:Row)=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name)+'</option>').join("")+
    '</select></label><label>Storyboard prompt<textarea name="framePrompt" rows="3" placeholder="Describe the image you want to generate."'+attrs+'></textarea></label>';
  const dlg = modal();
  dlg.innerHTML = '<header><div><span class="eyebrow">MOTHLIGHT V2</span><h2>'+ (locked?"View take":"Edit take") +'</h2></div><button type="button" id="v2-close" aria-label="Close">×</button></header>' +
    (t.media_id ? '<video class="v2-video" src="'+media(t.media_id)+'" controls></video>' : '') +
    '<form id="v2-form"><div class="v2-form-grid">' +
    '<label>Service<select name="provider"'+attrs+'><option value="byteplus"'+(t.provider==="byteplus"?' selected':'')+'>Seedance · BytePlus</option><option value="custom"'+(t.provider==="custom"?' selected':'')+'>Local video adapter</option></select></label>' +
    '<label>Model<select name="model"'+attrs+'>'+modelOptions(t.provider,t.model)+'</select></label>' +
    '<label>Duration (sec)<input type="number" min="2" max="30" step="1" name="duration" value="'+escapeHtml(options.duration??8)+'"'+attrs+'></label>' +
    '<label>Resolution<select name="resolution"'+attrs+'>'+["480p","720p"].map(v=>'<option'+(v===options.resolution?' selected':'')+'>'+v+'</option>').join("")+'</select></label>' +
    '<label>Aspect ratio<select name="ratio"'+attrs+'>'+["adaptive","9:16","16:9","1:1","3:4","4:3","21:9"].map(v=>'<option'+(v===options.ratio?' selected':'')+'>'+v+'</option>').join("")+'</select></label>' +
    '<label>Image input<select name="mode"'+attrs+'>'+["references","frames","text"].map(v=>'<option value="'+v+'"'+(v===options.mode?' selected':'')+'>'+({references:"Reference images",frames:"First / last frame",text:"Text only"} as Row)[v]+'</option>').join("")+'</select></label>' +
    '<label>Visual style<select name="styleAssetId"'+attrs+'>'+styleOptions+'</select></label>' +
    '<label class="v2-check"><input type="checkbox" name="audio"'+(options.audio?' checked':'')+attrs+'> Generate sound</label></div>' +
    '<label>Storyboard images <span class="v2-hint">Drag or paste an image, or choose from the World library.</span><div id="v2-references"></div></label>' +
    (!locked?'<div class="v2-ref-actions"><button type="button" id="v2-paste">Paste image</button><button type="button" id="v2-world">+ World asset</button></div>':'') +
    '<div id="v2-world-list" hidden>'+imageOptionRows()+'</div>' +
    '<label>Generation prompt<textarea name="prompt" rows="7" placeholder="Describe the intended sequence of shots. Nothing is automatically added. " '+attrs+'>'+escapeHtml(t.prompt)+'</textarea></label>' +
    '<details class="v2-frame-generator"><summary>Storyboard generation · Nano Banana / GPT Image</summary>' + frameSelect + '</details>' +
    '<label class="v2-check"><input type="checkbox" name="includeInCut"'+(t.includeInCut?' checked':'')+(ctx!.readonly?' disabled':'')+'> Include in Resolve handoff</label>' +
    '<p id="v2-dialog-message" role="status"></p>' +
    '<footer><button type="button" id="v2-cancel">Close</button>' +
    (!locked ? '<button type="button" id="v2-storyboard">Generate storyboard</button><button type="button" id="v2-import-video">Import video</button><input type="file" id="v2-import-video-file" accept="video/mp4,video/webm,video/quicktime" hidden><button type="submit" name="intent" value="save">Save draft</button><button class="button primary" type="submit" name="intent" value="generate">Save & generate video</button>' : '') +
    '</footer></form>';
  references();
  dlg.showModal();
}
async function uploadImage(file:File) {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Use PNG, JPEG or WebP.");
  const form = new FormData(); form.append("file",file,file.name || "clipboard.png");
  const result = await send(endpoint("media"),"POST",form);
  ctx!.workspace.media.push(result);
  stagedRefs.push(result.id); references();
}
async function addFiles(files: File[]) {
  try { for (const file of files) await uploadImage(file); }
  catch(e) { dialogStatus((e as Error).message); }
}
function dialogStatus(text: string) { const label=byId("v2-dialog-message"); if(label) label.textContent=text; }
async function pasteImage() {
  try {
    const list = await navigator.clipboard.read();
    for (const item of list) {
      const mimeType = item.types.find(type=>["image/png","image/jpeg","image/webp"].includes(type));
      if (!mimeType) continue;
      const blob = await item.getType(mimeType);
      await uploadImage(new File([blob],"pasted-"+Date.now()+".png",{type:mimeType}));return;
    }
    dialogStatus("No supported image on clipboard.");
  } catch { dialogStatus("Clipboard access denied. Press Cmd/Ctrl+V in the dialog or drag an image."); }
}
function onModalPaste(e: ClipboardEvent) {
  const file = Array.from(e.clipboardData?.files || []).find(f=>f.type.startsWith("image/"));
  if (file) {e.preventDefault();void addFiles([file]);}
}
function onModalChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.name==="includeInCut" && current?.media_id && !ctx?.readonly) {
    void send(v2path("takes/"+current.id),"PATCH",{includeInCut:input.checked})
      .then(t=>{takes=takes.map(x=>x.id===t.id?t:x);current=t;paint();dialogStatus("Cut selection updated.");})
      .catch(dialogStatus);
  }
  if (input.id==="v2-file" && input.files) void addFiles(Array.from(input.files));
  if (input.id==="v2-import-video-file" && input.files?.[0]) {
    void (async()=>{
      try {
        if (!current) return;
        await saveDraft();
        const form=new FormData(), file=input.files![0];
        form.append("file",file,file.name);
        const m=await send(endpoint("media"),"POST",form);
        ctx!.workspace.media.push(m);
        await send(v2path("takes/"+current.id+"/import-video"),"POST",{mediaId:m.id});
        await refreshTakes(false);
        modal().close();
        setStatus("Video imported");
      } catch(error) {dialogStatus((error as Error).message);}
    })();
  }
  if (input.name==="frameProvider") {
    const select=modal().querySelector<HTMLSelectElement>('[name="frameModel"]');
    if (select) select.innerHTML=(ctx!.workspace.imageModels?.[input.value] || [])
      .map((m:Row)=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name)+'</option>').join("");
  }
  if (input.name==="provider") {
    const select = modal().querySelector<HTMLSelectElement>('[name="model"]');
    if (select) select.innerHTML=modelOptions(input.value, "");
  }
}
function onModalClick(e: MouseEvent) {
  const target = e.target as HTMLElement, dlg=modal();
  if (target.id==="v2-close" || target.id==="v2-cancel") {dlg.close();return;}
  if (target.id==="v2-paste") {void pasteImage();return;}
  if (target.id==="v2-world") {const picker=byId("v2-world-list")!;picker.hidden=!picker.hidden;return;}
  if (target.id==="v2-storyboard") {void generateFrame();return;}
  if (target.id==="v2-import-video") {byId("v2-import-video-file")?.click();return;}
  const world = target.closest<HTMLButtonElement>("[data-ref]");
  if (world && !ctx!.readonly) {
    stagedRefs.push(world.dataset.ref!); references();byId("v2-world-list")!.hidden=true;return;
  }
  const remove = target.closest<HTMLButtonElement>("[data-ref-remove]");
  if (remove) {stagedRefs.splice(Number(remove.dataset.refRemove),1);references();return;}
  const left = target.closest<HTMLButtonElement>("[data-ref-left]");
  if (left) { const i=Number(left.dataset.refLeft);[stagedRefs[i-1],stagedRefs[i]]=[stagedRefs[i],stagedRefs[i-1]];references(); }
}
function readForm() {
  const form=byId("v2-form") as HTMLFormElement;
  const values=new FormData(form);
  return { provider:String(values.get("provider")), model:String(values.get("model")), prompt:String(values.get("prompt")||""),
    styleAssetId:values.get("styleAssetId") || null, referenceIds:stagedRefs,
    includeInCut:values.has("includeInCut"),
    options: { duration:Number(values.get("duration")),resolution:String(values.get("resolution")),
      ratio:String(values.get("ratio")),mode:String(values.get("mode")), audio:values.has("audio") } };
}
async function saveDraft() {
  const data = readForm();
  if (!current) throw new Error("No take selected.");
  const updated = await send(v2path("takes/"+current.id),"PATCH",data);
  takes=takes.map(t=>t.id===updated.id?updated:t);
  current=updated; paint();
}
async function onModalSubmit(e: SubmitEvent) {
  if (!(e.target instanceof HTMLFormElement) || e.target.id!=="v2-form") return;
  e.preventDefault();
  const intent=(e.submitter as HTMLButtonElement | null)?.value || "save";
  try {
    dialogStatus("Saving…");
    await saveDraft();
    if (intent==="generate") {
      await send(v2path("takes/"+current!.id+"/generate"),"POST",{});
      dialogStatus("Video generation queued. Follow progress on the Production page.");
      await refreshTakes(false);
      modal().close();
    } else {dialogStatus("Draft saved.");}
  } catch(error) {dialogStatus((error as Error).message);}
}
async function generateFrame() {
  if (!current) return;
  try {
    await saveDraft();
    const form=byId("v2-form") as HTMLFormElement;
    const provider=String((form.elements.namedItem("frameProvider") as HTMLSelectElement).value);
    const model=String((form.elements.namedItem("frameModel") as HTMLSelectElement).value);
    const prompt=String((form.elements.namedItem("framePrompt") as HTMLTextAreaElement).value);
    if (!prompt.trim()) throw new Error("Enter a storyboard prompt first.");
    await send(v2path("takes/"+current.id+"/generate-frame"),"POST",{provider,model,prompt});
    dialogStatus("Storyboard image queued. Refresh this take after Production shows completion.");
  } catch(error) { dialogStatus((error as Error).message); }
}
async function exportSequence() {
  if (!ctx) return;
  if (pending) await flushSave();
  window.location.href=projectPath()+"/export";
}
