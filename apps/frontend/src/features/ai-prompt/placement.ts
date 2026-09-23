import type { Shape } from "@whiteboard/shared";
import { shapeBounds, unionBounds } from "@/canvas/bounds";
import type { Box } from "@/canvas/coords";

/** World units between existing content and inserted AI content placed beside it. */
const GAP = 120;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where to put the top-left of new content of `size`: centred on `centre` (the viewport
 * centre) if that spot is empty, otherwise to the right of all existing content.
 */
export function placeContent(
  size: { width: number; height: number },
  centre: { x: number; y: number },
  existing: Shape[],
): { x: number; y: number } {
  const centred = { x: centre.x - size.width / 2, y: centre.y - size.height / 2 };
  const target = { ...centred, ...size };
  if (!existing.some((s) => overlaps(shapeBounds(s), target))) return centred;
  const content = unionBounds(existing)!;
  return { x: content.x + content.width + GAP, y: content.y };
}
