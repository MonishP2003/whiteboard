import type { Shape, TextShape } from "@whiteboard/shared";
import type { Box } from "./coords";
import { textShapeHeight } from "./text";

/** Measures a text shape's height. Injectable, since the default needs a real canvas. */
export type TextHeight = (shape: TextShape) => number;

/** The shape's box in its own unrotated coordinates, relative to its x/y. */
export function localBox(shape: Shape, textHeight: TextHeight = textShapeHeight): Box {
  switch (shape.type) {
    case "text":
      return { x: 0, y: 0, width: shape.width, height: textHeight(shape) };
    case "freehand": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < shape.points.length; i += 2) {
        minX = Math.min(minX, shape.points[i]!);
        maxX = Math.max(maxX, shape.points[i]!);
        minY = Math.min(minY, shape.points[i + 1]!);
        maxY = Math.max(maxY, shape.points[i + 1]!);
      }
      if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
      const pad = shape.style.strokeWidth / 2;
      return {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
      };
    }
    default:
      return { x: 0, y: 0, width: shape.width, height: shape.height };
  }
}

/**
 * Axis-aligned box around a shape in world coordinates. Rotation is around the shape's
 * x/y (as on its Konva node), so the rotated corners are measured exactly.
 */
export function shapeBounds(shape: Shape, textHeight?: TextHeight): Box {
  const box = localBox(shape, textHeight);
  const rad = (shape.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: [number, number][] = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ];
  const xs = corners.map(([x, y]) => shape.x + x * cos - y * sin);
  const ys = corners.map(([x, y]) => shape.y + x * sin + y * cos);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The box around all `shapes`, or null if there are none. */
export function unionBounds(shapes: Iterable<Shape>, textHeight?: TextHeight): Box | null {
  return unionBoxes([...shapes].map((shape) => shapeBounds(shape, textHeight)));
}

/** The box around all `boxes`, or null if there are none. */
export function unionBoxes(boxes: Iterable<Box>): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
