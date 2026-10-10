import { all, one, type Row } from "./db";
import { requireValue } from "./auth";
export function projectShots(projectId: string): Row[] {
  return all(
    `SELECT sh.*, sc.heading, t.media_id, t.trim_in, t.label AS take_label, m.filename, m.local_path, m.stored_name
    FROM shots sh JOIN scenes sc ON sc.id=sh.scene_id
    LEFT JOIN takes t ON t.id=sh.selected_take_id LEFT JOIN media m ON m.id=t.media_id
    WHERE sc.project_id=? ORDER BY sc.position,sc.id,sh.position,sh.id`,
    projectId,
  );
}
export function timecode(frames: number, fps: number): string {
  const n = Math.round(frames);
  return [
    Math.floor(n / (fps * 3600)),
    Math.floor(n / (fps * 60)) % 60,
    Math.floor(n / fps) % 60,
    n % fps,
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export const frameCount = (seconds: number, fps: number) =>
  Math.max(1, Math.round(seconds * fps));
export function resolveExport(project: Row) {
  const shots = projectShots(project.id);
  requireValue(
    shots.length && shots.every((s) => s.media_id),
    "Select a video take for every shot before exporting.",
    409,
  );
  requireValue(
    shots.length <= 999,
    "CMX3600 exports support up to 999 events per handoff. Split this production into parts.",
    409,
  );
  const fps = project.fps;
  let position = fps * 3600;
  const lines = [
    `TITLE: ${project.title.replace(/[\r\n]/g, " ")}`,
    "FCM: NON-DROP FRAME",
    "",
  ];
  const clips = shots.map((s, i) => {
    const length = frameCount(s.duration, fps),
      trim = Math.round(s.trim_in * fps);
    const reel = `ML${String(i + 1).padStart(6, "0")}`;
    lines.push(
      `${String(i + 1).padStart(3, "0")}  ${reel} V     C        ${timecode(trim, fps)} ${timecode(trim + length, fps)} ${timecode(position, fps)} ${timecode(position + length, fps)}`,
      `* FROM CLIP NAME: ${s.stored_name.replace(/[\r\n]/g, " ")}`,
      `* COMMENT: ${s.title.replace(/[\r\n]/g, " ")}`,
      "",
    );
    const clip = {
      shotId: s.id,
      title: s.title,
      scene: s.heading,
      reel,
      mediaId: s.media_id,
      filename: s.stored_name,
      originalFilename: s.filename,
      localPath: s.local_path,
      storedName: s.stored_name,
      sourceInFrames: trim,
      durationFrames: length,
      timelineInFrames: position,
      timelineOutFrames: position + length,
    };
    position += length;
    return clip;
  });
  return {
    edl: lines.join("\n"),
    manifest: {
      version: 1,
      title: project.title,
      fps,
      width: project.width,
      height: project.height,
      startTimecode: "01:00:00:00",
      clips,
      audio: all(
        "SELECT a.*,m.filename,m.local_path,m.stored_name FROM audio_cues a JOIN media m ON m.id=a.media_id WHERE project_id=? ORDER BY offset",
        project.id,
      ),
    },
    project: projectDocument(project.id),
  };
}
export function projectDocument(projectId: string) {
  const project = one("SELECT * FROM projects WHERE id=?", projectId)!;
  return {
    ...project,
    scenes: all(
      "SELECT * FROM scenes WHERE project_id=? ORDER BY position,id",
      projectId,
    ).map((s) => ({
      ...s,
      shots: all(
        "SELECT * FROM shots WHERE scene_id=? ORDER BY position,id",
        s.id,
      ).map((sh) => ({
        ...sh,
        assets: all(
          "SELECT a.* FROM assets a JOIN shot_assets sa ON sa.asset_id=a.id WHERE sa.shot_id=?",
          sh.id,
        ),
        takes: all(
          "SELECT * FROM takes WHERE shot_id=? ORDER BY created_at,id",
          sh.id,
        ),
      })),
    })),
    audio: all(
      "SELECT * FROM audio_cues WHERE project_id=? ORDER BY offset",
      projectId,
    ),
  };
}
