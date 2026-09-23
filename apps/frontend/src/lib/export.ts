import type Konva from "konva";
import { getActiveStage } from "@/canvas/activeStage";
import { measureLabel, renderedFontSize, wrapLines } from "@/canvas/text";
import { useSceneStore } from "@/store/sceneStore";
import { contentBounds, exportItems, sceneToSvg, type TextLayout } from "./svg";

/** World units of margin around exported content. */
const PADDING = 32;
const PIXEL_RATIO = 2;
/** Browsers refuse canvases past roughly this many pixels per side. */
const MAX_CANVAS_SIDE = 16_384;
const BACKGROUND = "#ffffff";

/** Text layout measured by Konva, so exported text wraps exactly as on the canvas. */
export const konvaTextLayout: TextLayout = {
  shapeText(shape) {
    const text = shape.text ?? "";
    const fontSize = renderedFontSize(shape, text);
    return { fontSize, lines: text ? wrapLines(shape, text, fontSize) : [] };
  },
  label: measureLabel,
};

/** A file name from the board title, safe on every OS. */
function fileName(title: string, ext: string): string {
  const printable = [...title].filter((ch) => ch.charCodeAt(0) >= 0x20).join("");
  const base = printable
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${base || "board"}.${ext}`;
}

function download(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Downloads the board (or just `ids`) as an SVG built from the scene. Returns false if
 * there was nothing to export.
 */
export function exportSvg(title: string, ids?: string[]): boolean {
  const svg = sceneToSvg(useSceneStore.getState().scene, konvaTextLayout, {
    ids,
    padding: PADDING,
    background: BACKGROUND,
  });
  if (!svg) return false;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  download(url, fileName(title, "svg"));
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return true;
}

/**
 * Downloads the board (or just `ids`) as a PNG at 2× resolution, cropped to the content.
 *
 * The stage transform is reset to identity for the capture, so the image is the same at
 * any zoom or pan. The grid, overlay layer (Transformer, drafts) and selection highlights
 * are hidden, then everything is restored before the next paint.
 */
export function exportPng(title: string, ids?: string[]): boolean {
  const stage = getActiveStage();
  const scene = useSceneStore.getState().scene;
  const items = exportItems(scene, ids);
  const box = contentBounds(scene, items, konvaTextLayout);
  if (!stage || !box) return false;

  const x = box.x - PADDING;
  const y = box.y - PADDING;
  const width = box.width + PADDING * 2;
  const height = box.height + PADDING * 2;
  const pixelRatio = Math.min(PIXEL_RATIO, MAX_CANVAS_SIDE / Math.max(width, height));

  // Everything not part of the picture.
  const exported = new Set([...items.shapes, ...items.connectors].map((i) => i.id));
  const hidden: Konva.Node[] = [
    ...stage.find(".grid-layer, .overlay-layer, .selection-ui"),
    ...stage.find(".shape, .connector").filter((n) => !exported.has(n.id())),
  ].filter((n) => n.visible());

  const saved = { x: stage.x(), y: stage.y(), scale: stage.scaleX() };
  let canvas: HTMLCanvasElement;
  try {
    for (const n of hidden) n.hide();
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
    canvas = stage.toCanvas({ x, y, width, height, pixelRatio });
  } finally {
    stage.position({ x: saved.x, y: saved.y });
    stage.scale({ x: saved.scale, y: saved.scale });
    for (const n of hidden) n.show();
    stage.batchDraw();
  }

  // Layers are transparent; composite onto white.
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    download(url, fileName(title, "png"));
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, "image/png");
  return true;
}
