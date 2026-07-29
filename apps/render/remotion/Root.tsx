import {
  CANVAS_FPS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createEmptyProject,
  resolveProjectDurationMs,
} from "@mothlight/core";
import { Composition } from "remotion";
import { MothlightVideo, type MothlightVideoProps } from "./MothlightVideo";

export const COMPOSITION_ID = "MothlightVideo";

/**
 * Remotion's entry point.
 *
 * Duration is calculated from the props rather than fixed, because every project is a
 * different length — `calculateMetadata` is how Remotion supports that.
 */
export function RemotionRoot() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={MothlightVideo}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      fps={CANVAS_FPS}
      // Replaced per-render by calculateMetadata; Remotion requires a positive default.
      durationInFrames={CANVAS_FPS}
      defaultProps={
        { project: createEmptyProject("Preview"), assetSources: {} } as MothlightVideoProps
      }
      calculateMetadata={({ props }) => {
        const durationMs = resolveProjectDurationMs(props.project);
        return {
          durationInFrames: Math.max(1, Math.round((durationMs / 1000) * CANVAS_FPS)),
          fps: props.project.canvas.fps || CANVAS_FPS,
          width: props.project.canvas.width || CANVAS_WIDTH,
          height: props.project.canvas.height || CANVAS_HEIGHT,
        };
      }}
    />
  );
}
