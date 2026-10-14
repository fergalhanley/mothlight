/** Shot breakdown Markdown v1: scene number + Fountain heading, then numbered shot blocks.
 * The ordinal disambiguates repeated scene headings (e.g. two visits to Ryan's bedroom).
 * Text above/below the shot breakdown is ignored.
 */
export type ImportedShot = {
  title: string;
  action: string;
  dialogue: string;
  camera: string;
  continuity: string;
  duration: number;
};

export type ImportedScene = {
  number: number;
  heading: string;
  shots: ImportedShot[];
};

export const normalizedHeading = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

export function parseShotMarkdown(source: string): ImportedScene[] {
  if (typeof source !== "string" || !source.trim() || source.length > 1_000_000)
    throw new Error("Provide shot breakdown Markdown (maximum 1 MB).");

  const scenes: ImportedScene[] = [];
  const sceneNumbers = new Set<number>();
  let scene: ImportedScene | null = null;
  let draft: { number: number; fields: Record<string, string>; camera: string; duration: number } | null = null;
  let fieldName = "";

  const finishShot = () => {
    if (!draft || !scene) return;
    const action = (draft.fields.action || "").trim();
    if (!action) throw new Error("Scene " + scene.number + ", shot " + draft.number + ": Action is required.");
    const title = (draft.fields.title || action.split(/[.!?]\s|[.!?]$/)[0] || "Untitled shot")
      .replace(/\s+/g, " ").trim().slice(0, 160);
    if (!title) throw new Error("A shot title is required.");
    scene.shots.push({
      title,
      action,
      dialogue: (draft.fields["sound/dialogue"] || draft.fields.dialogue || "").trim(),
      camera: draft.camera,
      continuity: (draft.fields["continuity/assets"] || draft.fields.continuity || "").trim(),
      duration: draft.duration,
    });
    draft = null;
    fieldName = "";
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const section = line.match(/^##\s+Scene\s+(\d{1,3})\s*[—–-]\s*(.+)$/i);
    if (section) {
      finishShot();
      const number = Number(section[1]);
      if (number < 1 || sceneNumbers.has(number)) throw new Error("Duplicate or invalid scene number: " + number);
      sceneNumbers.add(number);
      scene = { number, heading: section[2].trim(), shots: [] };
      scenes.push(scene);
      continue;
    }
    if (line.startsWith("## ")) {
      finishShot();
      scene = null;
      continue;
    }
    const shot = line.match(/^###\s+(\d{1,3})\.(\d{1,3})\s*[·|]\s*(\d+(?:\.\d+)?)s\s*[·|]\s*(.+)$/i);
    if (shot) {
      finishShot();
      if (!scene) throw new Error("Shots must be under a numbered Scene heading.");
      const sceneNumber = Number(shot[1]);
      const shotNumber = Number(shot[2]);
      const duration = Number(shot[3]);
      if (sceneNumber !== scene.number || shotNumber !== scene.shots.length + 1)
        throw new Error("Shots must be sequential within Scene " + scene.number + ".");
      if (!(duration > 0 && duration <= 600))
        throw new Error("Shot duration must be greater than 0 and at most 600 seconds.");
      const camera = shot[4].trim();
      if (!camera || camera.length > 1000) throw new Error("Camera description must be between 1 and 1000 characters.");
      draft = { number: shotNumber, fields: {}, camera, duration };
      fieldName = "";
      continue;
    }
    if (!draft) continue;
    const field = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (field) {
      const key = field[1].trim().toLowerCase();
      if (!["title", "action", "sound/dialogue", "dialogue", "continuity/assets", "continuity"].includes(key))
        throw new Error("Unknown shot field: " + field[1]);
      if (draft.fields[key] !== undefined) throw new Error("Duplicate shot field: " + field[1]);
      draft.fields[key] = field[2];
      fieldName = key;
    } else if (line && fieldName) {
      draft.fields[fieldName] += "\n" + line;
    }
  }
  finishShot();
  if (!scenes.length || !scenes.some(s => s.shots.length))
    throw new Error("No numbered scenes with shots found. Expected ## Scene 01 — INT. ... and ### 01.01 · 5s · Camera.");
  if (scenes.length > 1000 || scenes.reduce((n, s) => n + s.shots.length, 0) > 2000)
    throw new Error("Import supports up to 1000 scenes and 2000 shots.");
  if (scenes.some(s => !s.shots.length)) throw new Error("Every imported scene needs at least one shot.");
  return scenes;
}
