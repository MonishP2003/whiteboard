import type Konva from "konva";
import type { Shape } from "@whiteboard/shared";
import type { ShapePatch } from "@/store/sceneStore";
import { MIN_SHAPE_SIZE } from "../defaults";
import { textStyle } from "../text";

const MAX_FONT_SIZE = 1_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns the scale the Transformer left on `node` into real sizes, and resets the node's
 * scale to 1. Saved shapes never carry scaleX/scaleY.
 */
export function bakeTransform(node: Konva.Node, shape: Shape): ShapePatch {
  const sx = node.scaleX();
  const sy = node.scaleY();
  node.scale({ x: 1, y: 1 });
  node.skew({ x: 0, y: 0 });

  const base = {
    x: node.x(),
    y: node.y(),
    rotation: round2(((node.rotation() % 360) + 360) % 360),
  };
  const scaleSize = (s: { width: number; height: number }) => ({
    width: Math.max(MIN_SHAPE_SIZE, s.width * sx),
    height: Math.max(MIN_SHAPE_SIZE, s.height * sy),
  });
  const scaleFont = (fontSize: number, factor: number) =>
    Math.min(MAX_FONT_SIZE, Math.max(1, round2(fontSize * factor)));

  switch (shape.type) {
    case "freehand":
      // Scale applies in the node's local (unrotated) space, so scaling the points matches.
      return { ...base, points: shape.points.map((v, i) => round2(v * (i % 2 === 0 ? sx : sy))) };
    case "text": {
      const width = Math.max(MIN_SHAPE_SIZE, shape.width * sx);
      // Side anchors only change the wrap width; corners scale the font, not the glyphs.
      if (Math.abs(sy - 1) < 1e-3) return { ...base, width };
      const fontSize = scaleFont(textStyle(shape).fontSize, sy);
      return { ...base, width, style: { ...shape.style, fontSize } };
    }
    case "sticky": {
      // The note's text grows with it (keepRatio keeps sx ≈ sy).
      const fontSize = scaleFont(textStyle(shape).fontSize, Math.min(sx, sy));
      return { ...base, ...scaleSize(shape), style: { ...shape.style, fontSize } };
    }
    default:
      return { ...base, ...scaleSize(shape) };
  }
}
