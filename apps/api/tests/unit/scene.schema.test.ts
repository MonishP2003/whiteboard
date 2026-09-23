import { describe, expect, test } from "vitest";
import { emptyScene, SCENE_LIMITS, SceneSchema, type Shape } from "@whiteboard/shared";

const style = { fill: "#fff", stroke: "#000", strokeWidth: 1, opacity: 1 };
const rect = (id: string): Shape => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  style,
});

const sceneWith = (...shapes: Shape[]) => ({
  ...emptyScene(),
  shapes: Object.fromEntries(shapes.map((s) => [s.id, s])),
  order: shapes.map((s) => s.id),
});

describe("SceneSchema", () => {
  test("accepts an empty scene and a valid one", () => {
    expect(SceneSchema.safeParse(emptyScene()).success).toBe(true);
    const scene = {
      ...sceneWith(rect("a"), rect("b")),
      connectors: { c: { id: "c", fromId: "a", toId: "b", style } },
    };
    expect(SceneSchema.safeParse(scene).success).toBe(true);
  });

  test("rejects an unknown shape type", () => {
    const scene = sceneWith({ ...rect("a"), type: "hexagon" } as unknown as Shape);
    expect(SceneSchema.safeParse(scene).success).toBe(false);
  });

  test("order must list every shape exactly once", () => {
    expect(SceneSchema.safeParse({ ...sceneWith(rect("a")), order: [] }).success).toBe(false);
    expect(SceneSchema.safeParse({ ...sceneWith(rect("a")), order: ["a", "a"] }).success).toBe(
      false,
    );
    expect(SceneSchema.safeParse({ ...sceneWith(rect("a")), order: ["b"] }).success).toBe(false);
  });

  test("shape and connector keys must match their ids", () => {
    const scene = { ...emptyScene(), shapes: { x: rect("a") }, order: ["x"] };
    expect(SceneSchema.safeParse(scene).success).toBe(false);
  });

  test("connectors must reference existing shapes", () => {
    const scene = {
      ...sceneWith(rect("a")),
      connectors: { c: { id: "c", fromId: "a", toId: "missing", style } },
    };
    expect(SceneSchema.safeParse(scene).success).toBe(false);
  });

  test("freehand points: even length, capped", () => {
    const stroke = (points: number[]): Shape => ({
      id: "f",
      type: "freehand",
      x: 0,
      y: 0,
      rotation: 0,
      style,
      points,
    });
    expect(SceneSchema.safeParse(sceneWith(stroke([0, 0, 1, 1]))).success).toBe(true);
    expect(SceneSchema.safeParse(sceneWith(stroke([0, 0, 1]))).success).toBe(false);
    const tooMany = new Array<number>(SCENE_LIMITS.maxFreehandCoords + 2).fill(0);
    expect(SceneSchema.safeParse(sceneWith(stroke(tooMany))).success).toBe(false);
  });

  test("rejects more than maxShapes shapes", () => {
    const shapes = Array.from({ length: SCENE_LIMITS.maxShapes + 1 }, (_, i) => rect(`s${i}`));
    expect(SceneSchema.safeParse(sceneWith(...shapes)).success).toBe(false);
  });
});
