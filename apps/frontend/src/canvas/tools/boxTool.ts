import { useUiStore } from "@/store/uiStore";
import { boxFromCorners, type Box, type Vec2 } from "../coords";
import { createBoxShape, defaultBox, type BoxShapeType } from "../defaults";
import { useDraftStore } from "../draftStore";
import { addAndSelect, screenScale, type ToolHandler } from "./types";

/** Drags shorter than this (in screen px) count as a click and create a default size. */
const CLICK_SLOP_PX = 4;

/** Rect, ellipse and sticky: drag to size, or click for a default-sized shape. */
export function createBoxTool(type: BoxShapeType): ToolHandler {
  let start: Vec2 | null = null;

  const boxTo = (from: Vec2, to: Vec2): Box => {
    if (type !== "sticky") return boxFromCorners(from, to);
    // Stickies stay square.
    const side = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return boxFromCorners(from, {
      x: from.x + Math.sign(to.x - from.x || 1) * side,
      y: from.y + Math.sign(to.y - from.y || 1) * side,
    });
  };

  const stop = () => {
    start = null;
    useDraftStore.getState().setDraft(null);
  };

  return {
    onPointerDown(_e, pos) {
      start = pos;
    },
    onPointerMove(_e, pos) {
      if (!start) return;
      useDraftStore.getState().setDraft({ kind: type, ...boxTo(start, pos) });
    },
    onPointerUp(_e, pos) {
      if (!start) return;
      const box = boxTo(start, pos);
      const from = start;
      stop();
      const slop = CLICK_SLOP_PX / screenScale();
      const dragged = box.width > slop || box.height > slop;
      const style = type === "sticky" ? { fill: useUiStore.getState().stickyColor } : undefined;
      addAndSelect(createBoxShape(type, dragged ? box : defaultBox(type, from), style));
    },
    cancel() {
      const active = start !== null;
      stop();
      return active;
    },
  };
}
