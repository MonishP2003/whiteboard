import type { Connector, Scene, Shape, TextShape } from "@whiteboard/shared";
import { shapeBounds, unionBoxes } from "@/canvas/bounds";
import {
  arrowHeadSize,
  connectorDash,
  connectorPoints,
  hasArrowEnd,
  hasArrowStart,
  shapeOutline,
} from "@/canvas/connectors/geometry";
import type { Box } from "@/canvas/coords";
import { FREEHAND_TENSION } from "@/canvas/defaults";
import {
  CONNECTOR_LABEL,
  DEFAULT_FONT_FAMILY,
  LINE_HEIGHT,
  supportsText,
  textBox,
  textStyle,
  type LabelSize,
  type TextCapableShape,
} from "@/canvas/text";

/*
 * Serializes the scene (not the Konva stage, which has no SVG export) to a standalone SVG.
 * Text layout comes from the canvas's own measurer, so lines wrap where they do on screen;
 * it's injected so this module stays testable without a real canvas.
 *
 * Portability choices (Inkscape and Figma import too, not just browsers):
 * - Arrow heads are plain polygons rather than <marker>s, which Figma ignores.
 * - "transparent" becomes "none"; text is vertically centred with `dy` rather than
 *   `dominant-baseline`, which Inkscape handles poorly.
 */

export interface TextLayout {
  /** Font size and wrapped lines of a shape's text, as drawn on the canvas. */
  shapeText(shape: TextCapableShape): { fontSize: number; lines: string[] };
  label(text: string): LabelSize;
}

/** What to export: all of `scene`, or only some of its shapes and connectors. */
export interface ExportItems {
  shapes: Shape[];
  connectors: Connector[];
}

/**
 * The shapes (back to front) and connectors to export. With `ids`, that's the selected
 * shapes, selected connectors, and connectors between two selected shapes.
 */
export function exportItems(scene: Scene, ids?: Iterable<string>): ExportItems {
  const picked = ids ? new Set(ids) : null;
  const has = (id: string) => !picked || picked.has(id);
  const shapes = scene.order.filter(has).flatMap((id) => scene.shapes[id] ?? []);
  const connectors = Object.values(scene.connectors).filter(
    (c) =>
      c.fromId in scene.shapes &&
      c.toId in scene.shapes &&
      (has(c.id) || (has(c.fromId) && has(c.toId))),
  );
  return { shapes, connectors };
}

const textHeightFor = (layout: TextLayout) => (shape: TextShape) => {
  const { fontSize, lines } = layout.shapeText(shape);
  return Math.max(1, lines.length) * fontSize * LINE_HEIGHT;
};

/** Where a connector is drawn: its line, and its label's tag if it has one. */
interface ConnectorLayout {
  points: [number, number, number, number];
  label: (LabelSize & Box) | null;
}

function layoutConnector(scene: Scene, c: Connector, layout: TextLayout): ConnectorLayout {
  const textHeight = textHeightFor(layout);
  const points = connectorPoints(
    shapeOutline(scene.shapes[c.fromId]!, { textHeight }),
    shapeOutline(scene.shapes[c.toId]!, { textHeight }),
  );
  if (!c.label) return { points, label: null };
  const size = layout.label(c.label);
  const pad = CONNECTOR_LABEL.padding;
  const width = size.width + pad * 2;
  const height = size.height + pad * 2;
  const x = (points[0] + points[2]) / 2 - width / 2;
  const y = (points[1] + points[3]) / 2 - height / 2;
  return { points, label: { ...size, x, y, width, height } };
}

/** The box around everything in `items`, arrow heads and labels included. */
export function contentBounds(scene: Scene, items: ExportItems, layout: TextLayout): Box | null {
  const textHeight = textHeightFor(layout);
  const boxes: Box[] = items.shapes.map((s) => shapeBounds(s, textHeight));
  for (const c of items.connectors) {
    const { points, label } = layoutConnector(scene, c, layout);
    const [x1, y1, x2, y2] = points;
    const r = arrowHeadSize(c.style.strokeWidth) / 2 + c.style.strokeWidth;
    boxes.push({
      x: Math.min(x1, x2) - r,
      y: Math.min(y1, y2) - r,
      width: Math.abs(x2 - x1) + r * 2,
      height: Math.abs(y2 - y1) + r * 2,
    });
    if (label) boxes.push(label);
  }
  return unionBoxes(boxes);
}

// ---------------------------------------------------------------------------------------

const num = (n: number) => String(Math.round(n * 100) / 100);

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const paint = (color: string) => (color === "transparent" ? "none" : escapeXml(color));

function attrs(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? num(v) : v}"`)
    .join("");
}

/** Konva's cardinal-spline control points (Util._expandPoints), for smoothed pen strokes. */
function freehandPath(p: number[], tension: number): string {
  const n = p.length;
  if (n < 2) return "";
  let d = `M${num(p[0]!)} ${num(p[1]!)}`;
  if (tension === 0 || n <= 4) {
    for (let i = 2; i < n; i += 2) d += ` L${num(p[i]!)} ${num(p[i + 1]!)}`;
    return d;
  }
  const tp: number[] = [];
  for (let i = 2; i < n - 2; i += 2) {
    const [x0, y0, x1, y1, x2, y2] = [p[i - 2]!, p[i - 1]!, p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!];
    const d01 = Math.hypot(x1 - x0, y1 - y0);
    const d12 = Math.hypot(x2 - x1, y2 - y1);
    const fa = (tension * d01) / (d01 + d12);
    const fb = (tension * d12) / (d01 + d12);
    if (Number.isNaN(fa)) continue;
    tp.push(x1 - fa * (x2 - x0), y1 - fa * (y2 - y0), x1, y1);
    tp.push(x1 + fb * (x2 - x0), y1 + fb * (y2 - y0));
  }
  const len = tp.length;
  const q = (a: number, b: number, c: number, e: number) =>
    ` Q${num(a)} ${num(b)} ${num(c)} ${num(e)}`;
  if (len < 4) return d + ` L${num(p[n - 2]!)} ${num(p[n - 1]!)}`;
  d += q(tp[0]!, tp[1]!, tp[2]!, tp[3]!);
  let i = 4;
  while (i < len - 2) {
    d += ` C${tp
      .slice(i, i + 6)
      .map(num)
      .join(" ")}`;
    i += 6;
  }
  return d + q(tp[len - 2]!, tp[len - 1]!, p[n - 2]!, p[n - 1]!);
}

/** One <text> with a <tspan> per line, laid out like Konva.Text inside `box`. */
function textElement(
  lines: string[],
  opts: {
    x: number;
    y: number;
    width: number;
    /** Undefined: top-aligned text of unbounded height. */
    height: number | undefined;
    fontSize: number;
    fontFamily: string;
    fontWeight: string;
    align: "left" | "center" | "right";
    color: string;
  },
): string {
  const lineHeight = opts.fontSize * LINE_HEIGHT;
  const textHeight = lines.length * lineHeight;
  const top =
    opts.y + (opts.height === undefined ? 0 : Math.max(0, (opts.height - textHeight) / 2));
  const anchor = { left: "start", center: "middle", right: "end" }[opts.align];
  const x = { left: 0, center: opts.width / 2, right: opts.width }[opts.align] + opts.x;
  const tspans = lines
    .map(
      (line, i) =>
        // Konva centres each line in its line box; 0.35em drops a middle to the baseline.
        `<tspan${attrs({ x, y: top + lineHeight * (i + 0.5), dy: "0.35em" })}>${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text${attrs({
    "font-size": opts.fontSize,
    "font-family": escapeXml(opts.fontFamily),
    "font-weight": opts.fontWeight === "bold" ? "bold" : undefined,
    "text-anchor": anchor,
    fill: paint(opts.color),
    "xml:space": "preserve",
  })}>${tspans}</text>`;
}

function shapeTextElement(shape: TextCapableShape, layout: TextLayout): string {
  const text = shape.text ?? "";
  if (!text) return "";
  const { fontSize, lines } = layout.shapeText(shape);
  const box = textBox(shape);
  const style = textStyle(shape);
  return textElement(lines, {
    ...box,
    fontSize,
    fontFamily: style.fontFamily,
    fontWeight: style.fontStyle,
    align: style.align,
    color: style.color,
  });
}

function shapeElement(shape: Shape, layout: TextLayout): string {
  const { style } = shape;
  const stroke = (width: number) =>
    width > 0 && style.stroke !== "transparent"
      ? { stroke: paint(style.stroke), "stroke-width": width }
      : { stroke: "none" };

  let body: string;
  switch (shape.type) {
    case "rect":
      body = `<rect${attrs({
        width: shape.width,
        height: shape.height,
        rx: style.cornerRadius || undefined,
        fill: paint(style.fill),
        ...stroke(style.strokeWidth),
      })}/>`;
      break;
    case "ellipse":
      body = `<ellipse${attrs({
        cx: shape.width / 2,
        cy: shape.height / 2,
        rx: shape.width / 2,
        ry: shape.height / 2,
        fill: paint(style.fill),
        ...stroke(style.strokeWidth),
      })}/>`;
      break;
    case "diamond": {
      const w = shape.width;
      const h = shape.height;
      body = `<polygon${attrs({
        points: [
          [w / 2, 0],
          [w, h / 2],
          [w / 2, h],
          [0, h / 2],
        ]
          .map(([px, py]) => `${num(px!)},${num(py!)}`)
          .join(" "),
        fill: paint(style.fill),
        ...stroke(style.strokeWidth),
        "stroke-linejoin": "round",
      })}/>`;
      break;
    }
    case "sticky":
      body = `<rect${attrs({
        width: shape.width,
        height: shape.height,
        rx: 2,
        fill: paint(style.fill),
        filter: "url(#sticky-shadow)",
      })}/>`;
      break;
    case "text":
      body = "";
      break;
    case "freehand":
      body = `<path${attrs({
        d: freehandPath(shape.points, FREEHAND_TENSION),
        fill: "none",
        ...stroke(style.strokeWidth),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      })}/>`;
      break;
    case "image":
      body = `<image${attrs({
        width: shape.width,
        height: shape.height,
        href: escapeXml(shape.src),
        preserveAspectRatio: "none",
      })}/>`;
      break;
  }
  if (supportsText(shape)) body += shapeTextElement(shape, layout);

  // Konva rotates a shape about its x/y, so translate there first, then rotate.
  const transform =
    `translate(${num(shape.x)} ${num(shape.y)})` +
    (shape.rotation ? ` rotate(${num(shape.rotation)})` : "");
  return `<g${attrs({
    transform,
    opacity: style.opacity < 1 ? style.opacity : undefined,
  })}>${body}</g>`;
}

/** A filled triangle with its tip at (x, y), pointing along `angle`. As Konva.Arrow draws it. */
function arrowHead(x: number, y: number, angle: number, size: number, color: string, sw: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pt = (px: number, py: number) =>
    `${num(x + px * cos - py * sin)},${num(y + px * sin + py * cos)}`;
  const points = [pt(0, 0), pt(-size, size / 2), pt(-size, -size / 2)].join(" ");
  return `<polygon${attrs({
    points,
    fill: paint(color),
    stroke: paint(color),
    "stroke-width": sw,
    "stroke-linejoin": "miter",
  })}/>`;
}

function connectorElement(scene: Scene, c: Connector, layout: TextLayout): string {
  const { points, label } = layoutConnector(scene, c, layout);
  const [x1, y1, x2, y2] = points;
  const { stroke, strokeWidth, opacity } = c.style;
  const dash = connectorDash(c);
  const head = arrowHeadSize(strokeWidth);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  let body = `<line${attrs({
    x1,
    y1,
    x2,
    y2,
    stroke: paint(stroke),
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
    "stroke-dasharray": dash?.map(num).join(" "),
  })}/>`;
  if (hasArrowEnd(c)) body += arrowHead(x2, y2, angle, head, stroke, strokeWidth);
  if (hasArrowStart(c)) body += arrowHead(x1, y1, angle + Math.PI, head, stroke, strokeWidth);
  if (label) {
    const pad = CONNECTOR_LABEL.padding;
    const { x, y, width, height } = label;
    body += `<rect${attrs({ x, y, width, height, rx: 3, fill: "#ffffff" })}/>`;
    body += textElement(label.lines, {
      x: label.x + pad,
      y: label.y + pad,
      width: label.width - pad * 2,
      height: undefined,
      fontSize: CONNECTOR_LABEL.fontSize,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: "normal",
      align: "center",
      color: CONNECTOR_LABEL.color,
    });
  }
  return `<g${attrs({ opacity: opacity < 1 ? opacity : undefined })}>${body}</g>`;
}

export interface SvgOptions {
  /** Only these shapes/connectors (see `exportItems`). Default: everything. */
  ids?: Iterable<string>;
  /** World units of margin around the content. */
  padding?: number;
  /** Background fill; null for transparent. */
  background?: string | null;
}

/** The scene as an SVG document, cropped to its content. Null if there's nothing to export. */
export function sceneToSvg(
  scene: Scene,
  layout: TextLayout,
  { ids, padding = 32, background = "#ffffff" }: SvgOptions = {},
): string | null {
  const items = exportItems(scene, ids);
  const content = contentBounds(scene, items, layout);
  if (!content) return null;
  const x = content.x - padding;
  const y = content.y - padding;
  const width = content.width + padding * 2;
  const height = content.height + padding * 2;

  const hasSticky = items.shapes.some((s) => s.type === "sticky");
  const defs = hasSticky
    ? `<defs><filter id="sticky-shadow" x="-20%" y="-20%" width="140%" height="150%">` +
      `<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.18"/>` +
      `</filter></defs>`
    : "";
  const bg = background
    ? `<rect${attrs({ x, y, width, height, fill: escapeXml(background) })}/>`
    : "";

  // Connectors draw above shapes, as on the canvas.
  const body = [
    ...items.shapes.map((s) => shapeElement(s, layout)),
    ...items.connectors.map((c) => connectorElement(scene, c, layout)),
  ].join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs({
      width,
      height,
      viewBox: [x, y, width, height].map(num).join(" "),
    })}>\n${defs}${bg}\n${body}\n</svg>\n`
  );
}
