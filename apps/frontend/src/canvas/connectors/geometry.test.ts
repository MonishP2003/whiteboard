import { describe, expect, test } from "vitest";
import { emptyScene, type Scene, type Shape } from "@whiteboard/shared";
import {
  anchorPoint,
  connectorPoints,
  outlineCentre,
  outlineContains,
  shapeAt,
  shapeOutline,
  type Outline,
} from "./geometry";

const style = { fill: "#fff", stroke: "#000", strokeWidth: 2, opacity: 1 };

function box(
  type: "rect" | "ellipse" | "diamond",
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
): Shape {
  return { id, type, x, y, width, height, rotation, style };
}

function sceneOf(...shapes: Shape[]): Scene {
  return {
    ...emptyScene(),
    shapes: Object.fromEntries(shapes.map((s) => [s.id, s])),
    order: shapes.map((s) => s.id),
  };
}

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe("anchorPoint", () => {
  const rect = shapeOutline(box("rect", "r", 0, 0, 100, 50));

  test("hits the rect edge facing the target", () => {
    close(anchorPoint(rect, { x: 500, y: 25 }), 100, 25);
    close(anchorPoint(rect, { x: -500, y: 25 }), 0, 25);
    close(anchorPoint(rect, { x: 50, y: 500 }), 50, 50);
    close(anchorPoint(rect, { x: 50, y: -500 }), 50, 0);
  });

  test("hits a corner on the diagonal", () => {
    close(anchorPoint(rect, { x: 150, y: 75 }), 100, 50);
  });

  test("returns the centre when the target is the centre", () => {
    close(anchorPoint(rect, { x: 50, y: 25 }), 50, 25);
  });

  test("uses the ellipse, not its box", () => {
    const ellipse = shapeOutline(box("ellipse", "e", 0, 0, 100, 100));
    // 45° from the centre (50, 50) of a radius-50 circle.
    const p = anchorPoint(ellipse, { x: 150, y: 150 });
    const r = 50 / Math.SQRT2;
    close(p, 50 + r, 50 + r);
    close(anchorPoint(ellipse, { x: 50, y: 400 }), 50, 100);
  });

  test("follows rotation exactly", () => {
    // 100×50 rotated 90° about (0, 0): it now spans x ∈ [-50, 0], y ∈ [0, 100].
    const rotated = shapeOutline(box("rect", "r", 0, 0, 100, 50, 90));
    close(outlineCentre(rotated), -25, 50);
    close(anchorPoint(rotated, { x: -25, y: 500 }), -25, 100);
    close(anchorPoint(rotated, { x: 500, y: 50 }), 0, 50);
  });
});

describe("connectorPoints", () => {
  test("joins the facing edges of two shapes", () => {
    const a = shapeOutline(box("rect", "a", 0, 0, 100, 100));
    const b = shapeOutline(box("rect", "b", 300, 0, 100, 100));
    expect(connectorPoints(a, b)).toEqual([100, 50, 300, 50]);
  });

  test("uses live drag positions when given", () => {
    const shape = box("rect", "a", 0, 0, 100, 100);
    const moved = shapeOutline(shape, {
      live: { x: 0, y: 300, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    const other = shapeOutline(box("rect", "b", 0, 0, 100, 100));
    const [x1, y1, x2, y2] = connectorPoints(moved, other);
    expect([x1, y1, x2, y2]).toEqual([50, 300, 50, 100]);
  });

  test("scales the box by a live transform", () => {
    const o: Outline = shapeOutline(box("rect", "a", 0, 0, 100, 100), {
      live: { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 1 },
    });
    expect(o.box).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});

describe("hit testing", () => {
  test("outlineContains respects ellipse corners and rotation", () => {
    const ellipse = shapeOutline(box("ellipse", "e", 0, 0, 100, 100));
    expect(outlineContains(ellipse, { x: 50, y: 50 })).toBe(true);
    expect(outlineContains(ellipse, { x: 5, y: 5 })).toBe(false);
    const rotated = shapeOutline(box("rect", "r", 0, 0, 100, 50, 90));
    expect(outlineContains(rotated, { x: -25, y: 90 })).toBe(true);
    expect(outlineContains(rotated, { x: 25, y: 10 })).toBe(false);
  });

  test("shapeAt returns the topmost shape and honours exclude", () => {
    const scene = sceneOf(
      box("rect", "bottom", 0, 0, 100, 100),
      box("rect", "top", 50, 50, 100, 100),
    );
    expect(shapeAt(scene, { x: 75, y: 75 })).toBe("top");
    expect(shapeAt(scene, { x: 75, y: 75 }, { exclude: "top" })).toBe("bottom");
    expect(shapeAt(scene, { x: 500, y: 500 })).toBeNull();
  });
});

describe("diamonds", () => {
  const diamond = shapeOutline(box("diamond", "d", 0, 0, 100, 60));

  test("anchors on the rhombus edge, not the bounding box", () => {
    close(anchorPoint(diamond, { x: 500, y: 30 }), 100, 30);
    close(anchorPoint(diamond, { x: 50, y: -500 }), 50, 0);
    // Along the diagonal to the box corner, the edge is halfway to the corner.
    close(anchorPoint(diamond, { x: 150, y: 90 }), 75, 45);
  });

  test("contains only points inside the rhombus", () => {
    expect(outlineContains(diamond, { x: 50, y: 30 })).toBe(true);
    expect(outlineContains(diamond, { x: 70, y: 40 })).toBe(true);
    expect(outlineContains(diamond, { x: 95, y: 5 })).toBe(false);
  });
});
