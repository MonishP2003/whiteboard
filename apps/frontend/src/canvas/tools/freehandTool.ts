import simplify from "simplify-js";
import { useSceneStore } from "@/store/sceneStore";
import { createFreehandShape } from "../defaults";
import { useDraftStore } from "../draftStore";
import { screenScale, type ToolHandler } from "./types";

/** Maximum deviation from the drawn stroke after simplification, in screen px. */
const SIMPLIFY_TOLERANCE_PX = 2;

/**
 * Points are collected here, not in the scene store: 60 updates a second would flood
 * autosave (and Stage 6's undo history). The stroke is simplified and added once on release.
 */
export function createFreehandTool(): ToolHandler {
  let points: number[] | null = null;

  const stop = () => {
    points = null;
    useDraftStore.getState().setDraft(null);
  };

  return {
    onPointerDown(_e, pos) {
      points = [pos.x, pos.y];
      useDraftStore.getState().setDraft({ kind: "freehand", points: points.slice() });
    },
    onPointerMove(_e, pos) {
      if (!points) return;
      points.push(pos.x, pos.y);
      useDraftStore.getState().setDraft({ kind: "freehand", points: points.slice() });
    },
    onPointerUp() {
      if (!points) return;
      const raw = points;
      stop();

      const xy = [];
      for (let i = 0; i < raw.length; i += 2) xy.push({ x: raw[i]!, y: raw[i + 1]! });
      const simplified = simplify(xy, SIMPLIFY_TOLERANCE_PX / screenScale()).flatMap((p) => [
        p.x,
        p.y,
      ]);
      // A click draws a dot: a zero-length segment with round caps.
      if (simplified.length < 4) simplified.push(simplified[0]!, simplified[1]!);

      // The pen stays active for the next stroke, and nothing is selected.
      useSceneStore.getState().addShape(createFreehandShape(simplified));
    },
    cancel() {
      const active = points !== null;
      stop();
      return active;
    },
  };
}
