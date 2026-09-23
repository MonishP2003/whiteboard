import Konva from "konva";
import type {
  DiamondShape,
  EllipseShape,
  RectShape,
  Shape,
  StickyShape,
  TextShape,
} from "@whiteboard/shared";

export const DEFAULT_FONT_FAMILY = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

/** The font families the format panel offers. */
export const FONT_FAMILIES = [
  { label: "Sans", value: DEFAULT_FONT_FAMILY },
  { label: "Serif", value: "Georgia, Cambria, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
] as const;
export const LINE_HEIGHT = 1.25;
/** Text colour inside stickies, rects, ellipses and diamonds (their `fill` is the background). */
export const LABEL_COLOR = "#1f2937";
const MIN_FIT_FONT_SIZE = 6;

export type TextCapableShape = TextShape | StickyShape | RectShape | EllipseShape | DiamondShape;

export function supportsText(shape: Shape): shape is TextCapableShape {
  return (
    shape.type === "text" ||
    shape.type === "sticky" ||
    shape.type === "rect" ||
    shape.type === "ellipse" ||
    shape.type === "diamond"
  );
}

/** Where a shape's text sits, in the shape's local coordinates. */
export interface TextBox {
  x: number;
  y: number;
  width: number;
  /** Undefined for text shapes, which grow downwards. */
  height: number | undefined;
  verticalAlign: "top" | "middle";
}

export function textBox(shape: TextCapableShape): TextBox {
  if (shape.type === "text") {
    return { x: 0, y: 0, width: shape.width, height: undefined, verticalAlign: "top" };
  }
  // An ellipse's or diamond's usable area is roughly its inscribed rectangle (for a
  // diamond, the largest one is half its width and height).
  const inset = { sticky: 16, rect: 8, ellipse: 0.15, diamond: 0.25 }[shape.type];
  const relative = shape.type === "ellipse" || shape.type === "diamond";
  const padX = relative ? shape.width * inset : inset;
  const padY = relative ? shape.height * inset : inset;
  return {
    x: padX,
    y: padY,
    width: Math.max(1, shape.width - padX * 2),
    height: Math.max(1, shape.height - padY * 2),
    verticalAlign: "middle",
  };
}

export function textStyle(shape: TextCapableShape) {
  return {
    fontSize: shape.style.fontSize ?? (shape.type === "sticky" || shape.type === "text" ? 24 : 18),
    fontFamily: shape.style.fontFamily ?? DEFAULT_FONT_FAMILY,
    align: shape.style.textAlign ?? (shape.type === "text" ? "left" : "center"),
    color: shape.type === "text" ? shape.style.fill : LABEL_COLOR,
    /** Konva's `fontStyle`; the text editor uses the same value as CSS `font-weight`. */
    fontStyle: shape.style.fontWeight ?? "normal",
  };
}

/**
 * The font size a shape's text is drawn at: its style size, shrunk until the text fits
 * for boxed shapes (stickies, labels). Text shapes grow instead of shrinking.
 */
export function renderedFontSize(shape: TextCapableShape, text: string): number {
  const { fontSize, fontFamily, fontStyle } = textStyle(shape);
  const box = textBox(shape);
  return box.height === undefined
    ? fontSize
    : fitFontSize(text, box.width, box.height, fontSize, fontFamily, fontStyle);
}

let measurer: Konva.Text | undefined;
const getMeasurer = () => (measurer ??= new Konva.Text({ wrap: "word", lineHeight: LINE_HEIGHT }));

/** The height of a text shape's wrapped text (text shapes store no height). */
export function textShapeHeight(shape: TextShape): number {
  const { fontSize, fontFamily, fontStyle } = textStyle(shape);
  const m = getMeasurer();
  m.setAttrs({ text: shape.text || " ", width: shape.width, fontFamily, fontSize, fontStyle });
  return m.height();
}

/** The lines Konva wraps a shape's text into at `fontSize`, as drawn on the canvas. */
export function wrapLines(shape: TextCapableShape, text: string, fontSize: number): string[] {
  const { fontFamily, fontStyle } = textStyle(shape);
  const m = getMeasurer();
  m.setAttrs({ text, width: textBox(shape).width, fontFamily, fontSize, fontStyle });
  return m.textArr.map((line) => line.text);
}

/** Connector labels: small, unwrapped (newlines still break), on a white tag. */
export const CONNECTOR_LABEL = { fontSize: 14, padding: 4, color: LABEL_COLOR } as const;

export interface LabelSize {
  /** Text size, without the tag's padding. */
  width: number;
  height: number;
  lines: string[];
}

let labelMeasurer: Konva.Text | undefined;

export function measureLabel(text: string): LabelSize {
  const m = (labelMeasurer ??= new Konva.Text({
    lineHeight: LINE_HEIGHT,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: CONNECTOR_LABEL.fontSize,
  }));
  m.text(text || " ");
  return { width: m.width(), height: m.height(), lines: m.textArr.map((line) => line.text) };
}

let blockMeasurer: Konva.Text | undefined;

/**
 * The size of `text` in the default font: its natural width, or wrapped at `maxWidth` if
 * it's wider than that.
 */
export function measureTextBlock(
  text: string,
  fontSize: number,
  maxWidth: number,
): { width: number; height: number } {
  const m = (blockMeasurer ??= new Konva.Text({
    wrap: "word",
    lineHeight: LINE_HEIGHT,
    fontFamily: DEFAULT_FONT_FAMILY,
  }));
  m.setAttrs({ text: text || " ", fontSize, width: undefined });
  const natural = m.width();
  if (natural <= maxWidth) return { width: natural, height: m.height() };
  m.width(maxWidth);
  // Widest wrapped line, so short labels don't get the full `maxWidth`.
  const width = Math.max(...m.textArr.map((line) => line.width));
  return { width: Math.min(maxWidth, width), height: m.height() };
}

/** The largest font size ≤ `maxSize` at which `text` wraps into `width` × `height`. */
export function fitFontSize(
  text: string,
  width: number,
  height: number,
  maxSize: number,
  fontFamily: string,
  fontStyle = "normal",
): number {
  const m = getMeasurer();
  const fits = (fontSize: number) => {
    m.setAttrs({ text: text || " ", width, fontFamily, fontSize, fontStyle });
    return m.height() <= height;
  };
  if (fits(maxSize)) return maxSize;
  let lo = MIN_FIT_FONT_SIZE;
  let hi = maxSize;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 2) / 2;
}
