import type Konva from "konva";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Screen (stage container) coordinates → world coordinates. Every tool goes through this;
 * raw pointer positions are only right at 100% zoom with no pan.
 */
export function toWorld(stage: Konva.Stage, pointer: Vec2): Vec2 {
  return stage.getAbsoluteTransform().copy().invert().point(pointer);
}

/** The current pointer in world coordinates, or null if Konva hasn't seen one yet. */
export function pointerWorld(stage: Konva.Stage): Vec2 | null {
  const pointer = stage.getPointerPosition();
  return pointer ? toWorld(stage, pointer) : null;
}

/** The box spanned by two corners, whichever way round they are. */
export function boxFromCorners(a: Vec2, b: Vec2): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
