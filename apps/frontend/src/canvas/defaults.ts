import type {
  DiamondShape,
  EllipseShape,
  FreehandShape,
  RectShape,
  StickyShape,
  Style,
  TextShape,
} from "@whiteboard/shared";
import type { Box, Vec2 } from "./coords";
import { LINE_HEIGHT } from "./text";

export type BoxShapeType = "rect" | "ellipse" | "sticky";
/** Box shapes, plus the ones only presets and AI diagrams create (no drawing tool). */
export type PresetBoxType = BoxShapeType | "diamond";

/** Pen points are stored simplified, so a little tension smooths the corners back out. */
export const FREEHAND_TENSION = 0.4;

/** Smallest width/height a shape can be drawn or resized to, in world units. */
export const MIN_SHAPE_SIZE = 5;

export const DEFAULT_SIZE: Record<PresetBoxType, { width: number; height: number }> = {
  rect: { width: 160, height: 100 },
  ellipse: { width: 160, height: 100 },
  diamond: { width: 180, height: 120 },
  sticky: { width: 200, height: 200 },
};

export const DEFAULT_STYLE = {
  rect: { fill: "#ffffff", stroke: "#1f2937", strokeWidth: 2, opacity: 1, fontSize: 18 },
  ellipse: { fill: "#ffffff", stroke: "#1f2937", strokeWidth: 2, opacity: 1, fontSize: 18 },
  diamond: { fill: "#ffffff", stroke: "#1f2937", strokeWidth: 2, opacity: 1, fontSize: 18 },
  sticky: { fill: "#fff59d", stroke: "transparent", strokeWidth: 0, opacity: 1, fontSize: 24 },
  text: { fill: "#1f2937", stroke: "transparent", strokeWidth: 0, opacity: 1, fontSize: 24 },
  freehand: { fill: "transparent", stroke: "#1f2937", strokeWidth: 3, opacity: 1 },
} satisfies Record<PresetBoxType | "text" | "freehand", Style>;

const TEXT_WIDTH = 240;

function newId(): string {
  return crypto.randomUUID();
}

/** `style` overrides the type's defaults, e.g. a rounded rect or a sticky colour. */
export function createBoxShape(
  type: PresetBoxType,
  box: Box,
  style?: Partial<Style>,
): RectShape | EllipseShape | DiamondShape | StickyShape {
  const base = {
    id: newId(),
    x: box.x,
    y: box.y,
    width: Math.max(MIN_SHAPE_SIZE, box.width),
    height: Math.max(MIN_SHAPE_SIZE, box.height),
    rotation: 0,
    style: { ...DEFAULT_STYLE[type], ...style },
  };
  return type === "sticky" ? { ...base, type, text: "" } : { ...base, type };
}

/** A default-sized box centred on `at`. */
export function defaultBox(type: PresetBoxType, at: Vec2): Box {
  const { width, height } = DEFAULT_SIZE[type];
  return { x: at.x - width / 2, y: at.y - height / 2, width, height };
}

/** A text shape whose first line is vertically centred on `at`, starting at `at.x`. */
export function createTextShape(
  at: Vec2,
  { text = "", style: overrides }: { text?: string; style?: Partial<Style> } = {},
): TextShape {
  const style = { ...DEFAULT_STYLE.text, ...overrides };
  return {
    id: newId(),
    type: "text",
    x: at.x,
    y: at.y - (style.fontSize * LINE_HEIGHT) / 2,
    width: TEXT_WIDTH,
    rotation: 0,
    text,
    style,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `worldPoints` is flat [x0, y0, x1, y1, …]; stored points are relative to the top-left. */
export function createFreehandShape(worldPoints: number[]): FreehandShape {
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i < worldPoints.length; i += 2) {
    minX = Math.min(minX, worldPoints[i]!);
    minY = Math.min(minY, worldPoints[i + 1]!);
  }
  return {
    id: newId(),
    type: "freehand",
    x: round2(minX),
    y: round2(minY),
    rotation: 0,
    points: worldPoints.map((v, i) => round2(v - (i % 2 === 0 ? minX : minY))),
    style: { ...DEFAULT_STYLE.freehand },
  };
}
