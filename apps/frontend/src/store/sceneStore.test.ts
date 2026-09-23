import { beforeEach, describe, expect, test } from "vitest";
import { emptyScene, type Scene, type Shape } from "@whiteboard/shared";
import { beginHistoryBatch, endHistoryBatch, sameScene, useSceneStore } from "./sceneStore";

const style = { fill: "#fff", stroke: "#000", strokeWidth: 2, opacity: 1 };
const rect = (id: string, x = 0): Shape => ({
  id,
  type: "rect",
  x,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  style,
});

function sceneOf(...shapes: Shape[]): Scene {
  return {
    ...emptyScene(),
    shapes: Object.fromEntries(shapes.map((s) => [s.id, s])),
    order: shapes.map((s) => s.id),
  };
}

const store = () => useSceneStore.getState();
const history = () => useSceneStore.temporal.getState();
const shapeIds = () => Object.keys(store().scene.shapes).sort();

beforeEach(() => store().loadScene(sceneOf(rect("a"), rect("b", 100))));

describe("undo history", () => {
  test("loading a board leaves nothing to undo", () => {
    expect(history().pastStates).toHaveLength(0);
    history().undo();
    expect(shapeIds()).toEqual(["a", "b"]);
  });

  test("each action is one step, and redo reapplies it", () => {
    store().updateShape("a", { x: 50 });
    store().reorder(["a"], "front");
    expect(history().pastStates).toHaveLength(2);

    history().undo();
    expect(store().scene.order).toEqual(["a", "b"]);
    expect(store().scene.shapes.a!.x).toBe(50);
    history().undo();
    expect(store().scene.shapes.a!.x).toBe(0);

    history().redo();
    history().redo();
    expect(store().scene.shapes.a!.x).toBe(50);
    expect(store().scene.order).toEqual(["b", "a"]);
  });

  test("no-op updates don't create history entries", () => {
    store().updateShape("a", { x: 0 });
    store().updateStyle(["a"], { fill: "#fff" });
    store().reorder(["b"], "front");
    store().deleteItems(["missing"]);
    expect(history().pastStates).toHaveLength(0);
  });

  test("deleting a shape removes its connectors, and one undo restores both", () => {
    const cid = store().addConnector("a", "b");
    store().deleteItems(["a"]);
    expect(store().scene.connectors).toEqual({});
    expect(shapeIds()).toEqual(["b"]);

    history().undo();
    expect(shapeIds()).toEqual(["a", "b"]);
    expect(Object.keys(store().scene.connectors)).toEqual([cid]);
  });

  test("connector edits are undoable", () => {
    const cid = store().addConnector("a", "b");
    store().updateConnectors([cid], { dashed: true, style: { strokeWidth: 4 } });
    store().setConnectorLabel(cid, "  yes ");
    expect(store().scene.connectors[cid]).toMatchObject({ dashed: true, label: "yes" });

    history().undo();
    expect(store().scene.connectors[cid]!.label).toBeUndefined();
    history().undo();
    expect(store().scene.connectors[cid]!.dashed).toBeUndefined();
    expect(store().scene.connectors[cid]!.style.strokeWidth).toBe(2);
    history().undo();
    expect(store().scene.connectors).toEqual({});
  });

  test("a history batch is one step", () => {
    beginHistoryBatch();
    store().addShape(rect("c"));
    store().updateShape("c", { x: 30 });
    endHistoryBatch();
    expect(history().pastStates).toHaveLength(1);

    history().undo();
    expect(shapeIds()).toEqual(["a", "b"]);
  });

  test("a batch that changes nothing overall leaves no step", () => {
    beginHistoryBatch();
    store().addShape(rect("c"));
    store().deleteItems(["c"]);
    endHistoryBatch();
    expect(history().pastStates).toHaveLength(0);
  });

  test("undo marks the change for autosave", () => {
    store().updateShape("a", { x: 5 });
    history().undo();
    expect(store().lastChange).toBe("edit");
  });
});

describe("sameScene", () => {
  test("sees through rebuilt containers", () => {
    const a = sceneOf(rect("a"), rect("b"));
    const b = { ...a, shapes: { ...a.shapes }, order: [...a.order] };
    expect(sameScene(a, b)).toBe(true);
  });

  test("detects changed, added and reordered shapes", () => {
    const a = sceneOf(rect("a"), rect("b"));
    expect(sameScene(a, { ...a, shapes: { ...a.shapes, a: rect("a", 1) } })).toBe(false);
    expect(sameScene(a, sceneOf(rect("a"), rect("b"), rect("c")))).toBe(false);
    expect(sameScene(a, { ...a, order: ["b", "a"] })).toBe(false);
  });
});

describe("insertItems", () => {
  test("adds shapes on top and connectors between them as one undo step", () => {
    const connector = {
      id: "c1",
      fromId: "x",
      toId: "y",
      style: { ...style, fill: "transparent" },
    };
    const dangling = { ...connector, id: "c2", toId: "missing" };
    store().insertItems([rect("x"), rect("y", 50)], [connector, dangling]);
    expect(store().scene.order).toEqual(["a", "b", "x", "y"]);
    expect(Object.keys(store().scene.connectors)).toEqual(["c1"]);
    expect(history().pastStates).toHaveLength(1);

    history().undo();
    expect(shapeIds()).toEqual(["a", "b"]);
    expect(store().scene.connectors).toEqual({});
  });
});
