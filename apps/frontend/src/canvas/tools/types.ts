import type Konva from "konva";
import type { Shape } from "@whiteboard/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import type { Vec2 } from "../coords";

export type PointerEvent = Konva.KonvaEventObject<globalThis.PointerEvent>;
export type DragEvent = Konva.KonvaEventObject<globalThis.DragEvent>;

/**
 * A canvas tool. `Stage.tsx` forwards pointer events with the pointer already converted to
 * world coordinates. Tools change the scene through store actions only.
 */
export interface ToolHandler {
  onPointerDown?(e: PointerEvent, pos: Vec2): void;
  onPointerMove?(e: PointerEvent, pos: Vec2): void;
  onPointerUp?(e: PointerEvent, pos: Vec2): void;
  onDoubleClick?(e: PointerEvent, pos: Vec2): void;
  onDragStart?(e: DragEvent): void;
  onDragEnd?(e: DragEvent): void;
  /** Abandons an in-progress gesture. Returns true if there was one. */
  cancel?(): boolean;
}

/** The shape node (`name="shape"`) a Konva event target belongs to, if any. */
export function shapeNodeOf(target: Konva.Node): Konva.Node | undefined {
  return target.findAncestor(".shape", true) ?? undefined;
}

/** The connector group (`name="connector"`) a Konva event target belongs to, if any. */
export function connectorNodeOf(target: Konva.Node): Konva.Node | undefined {
  return target.findAncestor(".connector", true) ?? undefined;
}

export function screenScale(): number {
  return useUiStore.getState().viewport.scale;
}

/** Adds a shape, selects it and returns to the select tool (Miro behaviour). */
export function addAndSelect(shape: Shape): void {
  useSceneStore.getState().addShape(shape);
  const ui = useUiStore.getState();
  ui.select([shape.id]);
  ui.setTool("select");
}
