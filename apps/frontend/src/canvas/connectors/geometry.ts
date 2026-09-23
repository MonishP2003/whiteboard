import type { Connector, Scene, Shape } from "@whiteboard/shared";
import { localBox, type TextHeight } from "../bounds";
import type { Box, Vec2 } from "../coords";
import type { LiveTransform } from "./liveStore";

/*
 * Connector endpoints are computed at render time from both shapes' current geometry;
 * nothing positional is stored on a connector, so arrows follow moved shapes for free.
 *
 * Rotation is handled exactly rather than through the axis-aligned bounds: the target point
 * is rotated into the shape's own frame, intersected with its unrotated box (or ellipse, or diamond),
 * and the hit rotated back. So an arrow meets a rotated rect on its real edge.
 * Freehand strokes, text, stickies and images all count as their (rotated) box.
 */

/** A shape's hit area: `box` in the shape's local frame, rotated about (x, y). */
export interface Outline {
  kind: "rect" | "ellipse" | "diamond";
  x: number;
  y: number;
  /** Degrees, clockwise, as on the Konva node. */
  rotation: number;
  box: Box;
}

export interface OutlineOptions {
  /** A drag or transform in progress, which the store hasn't heard about yet. */
  live?: LiveTransform;
  textHeight?: TextHeight;
}

export function shapeOutline(shape: Shape, { live, textHeight }: OutlineOptions = {}): Outline {
  const box = localBox(shape, textHeight);
  const sx = live?.scaleX ?? 1;
  const sy = live?.scaleY ?? 1;
  return {
    kind: shape.type === "ellipse" || shape.type === "diamond" ? shape.type : "rect",
    x: live?.x ?? shape.x,
    y: live?.y ?? shape.y,
    rotation: live?.rotation ?? shape.rotation,
    box: { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy },
  };
}

function rotate(p: Vec2, degrees: number): Vec2 {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

function toLocal(o: Outline, p: Vec2): Vec2 {
  return rotate({ x: p.x - o.x, y: p.y - o.y }, -o.rotation);
}

function toWorld(o: Outline, p: Vec2): Vec2 {
  const r = rotate(p, o.rotation);
  return { x: r.x + o.x, y: r.y + o.y };
}

function localCentre(o: Outline): Vec2 {
  return { x: o.box.x + o.box.width / 2, y: o.box.y + o.box.height / 2 };
}

export function outlineCentre(o: Outline): Vec2 {
  return toWorld(o, localCentre(o));
}

/**
 * Where the ray from the outline's centre towards `towards` leaves the outline, in world
 * coordinates. `towards` at the centre gives the centre.
 */
export function anchorPoint(o: Outline, towards: Vec2): Vec2 {
  const c = localCentre(o);
  const t = toLocal(o, towards);
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return toWorld(o, c);

  const rx = o.box.width / 2;
  const ry = o.box.height / 2;
  let s: number;
  if (o.kind === "ellipse") {
    // Solve (s·dx / rx)² + (s·dy / ry)² = 1.
    const k = (dx * dx) / (rx * rx || 1e-9) + (dy * dy) / (ry * ry || 1e-9);
    s = 1 / Math.sqrt(k);
  } else if (o.kind === "diamond") {
    // Solve |s·dx| / rx + |s·dy| / ry = 1.
    s = 1 / (Math.abs(dx) / (rx || 1e-9) + Math.abs(dy) / (ry || 1e-9));
  } else {
    // The first box edge the ray reaches.
    const sx = dx === 0 ? Infinity : rx / Math.abs(dx);
    const sy = dy === 0 ? Infinity : ry / Math.abs(dy);
    s = Math.min(sx, sy);
  }
  return toWorld(o, { x: c.x + dx * s, y: c.y + dy * s });
}

/** Line endpoints `[x1, y1, x2, y2]`: each outline's edge, facing the other's centre. */
export function connectorPoints(from: Outline, to: Outline): [number, number, number, number] {
  const a = anchorPoint(from, outlineCentre(to));
  const b = anchorPoint(to, outlineCentre(from));
  return [a.x, a.y, b.x, b.y];
}

/** True if `p` (world) is inside the outline. */
export function outlineContains(o: Outline, p: Vec2): boolean {
  const l = toLocal(o, p);
  const { box } = o;
  if (o.kind === "ellipse" || o.kind === "diamond") {
    const rx = box.width / 2;
    const ry = box.height / 2;
    const nx = (l.x - box.x - rx) / (rx || 1e-9);
    const ny = (l.y - box.y - ry) / (ry || 1e-9);
    return o.kind === "ellipse" ? nx * nx + ny * ny <= 1 : Math.abs(nx) + Math.abs(ny) <= 1;
  }
  return l.x >= box.x && l.x <= box.x + box.width && l.y >= box.y && l.y <= box.y + box.height;
}

/** The topmost shape containing `p` (freehand by its box), skipping `exclude`. */
export function shapeAt(
  scene: Scene,
  p: Vec2,
  { exclude, textHeight }: { exclude?: string; textHeight?: TextHeight } = {},
): string | null {
  for (let i = scene.order.length - 1; i >= 0; i--) {
    const id = scene.order[i]!;
    const shape = scene.shapes[id];
    if (!shape || id === exclude) continue;
    if (outlineContains(shapeOutline(shape, { textHeight }), p)) return id;
  }
  return null;
}

/** Arrow head length and width for a stroke width, shared by the canvas and SVG export. */
export function arrowHeadSize(strokeWidth: number): number {
  return 6 + strokeWidth * 2;
}

export function hasArrowEnd(c: Connector): boolean {
  return c.arrowEnd ?? true;
}

export function hasArrowStart(c: Connector): boolean {
  return c.arrowStart ?? false;
}

/** Dash pattern for a dashed connector, scaled to its stroke width. */
export function connectorDash(c: Connector): number[] | undefined {
  const w = Math.max(1, c.style.strokeWidth);
  return c.dashed ? [w * 4, w * 3] : undefined;
}
