import { useSceneStore } from "@/store/sceneStore";
import { MAX_SCALE, MIN_SCALE, useUiStore, type Viewport } from "@/store/uiStore";
import { unionBounds } from "./bounds";
import type { Box, Vec2 } from "./coords";

/** Zoom levels the zoom buttons and shortcuts step through. */
const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Screen pixels left around the content by "fit to content". */
const FIT_PADDING = 80;
/** "Fit to content" never zooms in past this, so a lone small shape isn't blown up. */
const FIT_MAX_SCALE = 1;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Zooms to `scale`, keeping the world point under `screenPoint` where it is. */
export function zoomAround(vp: Viewport, screenPoint: Vec2, scale: number): Viewport {
  const next = clampScale(scale);
  const worldX = (screenPoint.x - vp.x) / vp.scale;
  const worldY = (screenPoint.y - vp.y) / vp.scale;
  return { x: screenPoint.x - worldX * next, y: screenPoint.y - worldY * next, scale: next };
}

function screenCentre(): Vec2 {
  const { width, height } = useUiStore.getState().canvasSize;
  return { x: width / 2, y: height / 2 };
}

/** The world point at the centre of the canvas. */
export function viewportCentreWorld(): Vec2 {
  const { viewport } = useUiStore.getState();
  const c = screenCentre();
  return { x: (c.x - viewport.x) / viewport.scale, y: (c.y - viewport.y) / viewport.scale };
}

function zoomToScale(scale: number): void {
  const { viewport, setViewport } = useUiStore.getState();
  setViewport(zoomAround(viewport, screenCentre(), scale));
}

// A small tolerance, so 0.3333 counts as being at the 0.33 step.
const EPS = 0.005;

export function zoomIn(): void {
  const { scale } = useUiStore.getState().viewport;
  zoomToScale(ZOOM_STEPS.find((s) => s > scale + EPS) ?? MAX_SCALE);
}

export function zoomOut(): void {
  const { scale } = useUiStore.getState().viewport;
  zoomToScale([...ZOOM_STEPS].reverse().find((s) => s < scale - EPS) ?? MIN_SCALE);
}

export function resetZoom(): void {
  zoomToScale(1);
}

/** Zooms and pans so every shape is visible. An empty board goes back to the origin. */
export function fitToContent(): void {
  const box = unionBounds(Object.values(useSceneStore.getState().scene.shapes));
  if (box) fitToBox(box);
  else useUiStore.getState().setViewport({ x: 0, y: 0, scale: 1 });
}

/** Zooms and pans so `box` (world coordinates) is centred and fully visible. */
export function fitToBox(box: Box): void {
  const { canvasSize, setViewport } = useUiStore.getState();
  const availW = Math.max(1, canvasSize.width - FIT_PADDING * 2);
  const availH = Math.max(1, canvasSize.height - FIT_PADDING * 2);
  const scale = clampScale(
    Math.min(FIT_MAX_SCALE, availW / Math.max(box.width, 1), availH / Math.max(box.height, 1)),
  );
  setViewport({
    x: canvasSize.width / 2 - (box.x + box.width / 2) * scale,
    y: canvasSize.height / 2 - (box.y + box.height / 2) * scale,
    scale,
  });
}
