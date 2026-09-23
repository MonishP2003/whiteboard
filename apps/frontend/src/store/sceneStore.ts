import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import { emptyScene, type Connector, type Scene, type Shape, type Style } from "@whiteboard/shared";

/** Any subset of a shape's fields except its identity. */
export type ShapePatch = Shape extends infer S
  ? S extends Shape
    ? Partial<Omit<S, "id" | "type">>
    : never
  : never;

/** Connector fields a user can change; `style` is merged, not replaced. */
export type ConnectorPatch = Partial<Pick<Connector, "arrowStart" | "arrowEnd" | "dashed">> & {
  style?: Partial<Style>;
};

export type ReorderDirection = "front" | "forward" | "backward" | "back";

/** How far a duplicate is offset from its original, in world units. */
const DUPLICATE_OFFSET = 20;
/** Undo steps kept. */
const HISTORY_LIMIT = 100;

export const DEFAULT_CONNECTOR_STYLE: Style = {
  fill: "transparent",
  stroke: "#1f2937",
  strokeWidth: 2,
  opacity: 1,
};

interface SceneState {
  scene: Scene;
  /**
   * What caused the latest scene change. Autosave ignores "load" so opening a board
   * doesn't immediately write it back.
   */
  lastChange: "load" | "edit";
  /** Replaces the scene and clears undo history. */
  loadScene: (scene: Scene) => void;
  addShape: (shape: Shape) => void;
  /**
   * Adds shapes (on top, in the given order) and connectors between them as one change, so
   * one undo removes all of them. Connectors to shapes that don't exist are skipped.
   */
  insertItems: (shapes: Shape[], connectors: Connector[]) => void;
  updateShape: (id: string, patch: ShapePatch) => void;
  /** Several shapes in one change, e.g. after dragging or transforming a multi-selection. */
  updateShapes: (patches: Record<string, ShapePatch>) => void;
  /** Merges `style` into each shape's style. */
  updateStyle: (ids: string[], style: Partial<Style>) => void;
  /**
   * Deletes the shapes and connectors with these IDs, plus every connector attached to a
   * deleted shape, as one change.
   */
  deleteItems: (ids: string[]) => void;
  /** Moves shapes in `scene.order`, keeping their relative order. */
  reorder: (ids: string[], direction: ReorderDirection) => void;
  /** Copies shapes (and connectors between them) on top of everything. Returns the new IDs. */
  duplicate: (ids: string[]) => string[];
  /** Returns the new connector's ID. */
  addConnector: (fromId: string, toId: string) => string;
  updateConnectors: (ids: string[], patch: ConnectorPatch) => void;
  /** An empty label removes it. */
  setConnectorLabel: (id: string, label: string) => void;
}

export function reorderIds(order: string[], ids: string[], direction: ReorderDirection): string[] {
  const moving = new Set(ids);
  const picked = order.filter((id) => moving.has(id));
  const rest = order.filter((id) => !moving.has(id));
  if (direction === "front") return [...rest, ...picked];
  if (direction === "back") return [...picked, ...rest];

  // One step: each selected shape swaps with the unselected neighbour above (or below) it.
  const next = [...order];
  const swap = (i: number, j: number) => ([next[i], next[j]] = [next[j]!, next[i]!]);
  if (direction === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (moving.has(next[i]!) && !moving.has(next[i + 1]!)) swap(i, i + 1);
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (moving.has(next[i]!) && !moving.has(next[i - 1]!)) swap(i, i - 1);
    }
  }
  return next;
}

function sameRecords<T>(a: Record<string, T>, b: Record<string, T>): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/**
 * True if two scenes have the same content. Immer keeps unchanged shapes and connectors
 * referentially equal, so comparing their references is enough — this only has to see
 * through containers that were rebuilt without changing (e.g. a shape added and removed
 * again, or `order` refiltered to the same IDs).
 */
export function sameScene(a: Scene, b: Scene): boolean {
  return (
    a === b ||
    (a.version === b.version &&
      a.order.length === b.order.length &&
      a.order.every((id, i) => id === b.order[i]) &&
      sameRecords(a.shapes, b.shapes) &&
      sameRecords(a.connectors, b.connectors))
  );
}

type Tracked = Pick<SceneState, "scene">;

export const useSceneStore = create<SceneState>()(
  temporal(
    immer((set, get) => ({
      scene: emptyScene(),
      lastChange: "load",

      loadScene: (scene) => {
        batch = null;
        set({ scene, lastChange: "load" });
        // Undo must not go back to the previous board, or to the empty scene before loading.
        const history = useSceneStore.temporal.getState();
        history.clear();
        history.resume();
      },

      addShape: (shape) =>
        set((s) => {
          s.scene.shapes[shape.id] = shape;
          s.scene.order.push(shape.id);
          s.lastChange = "edit";
        }),

      insertItems: (shapes, connectors) =>
        set((s) => {
          for (const shape of shapes) {
            if (!s.scene.shapes[shape.id]) s.scene.order.push(shape.id);
            s.scene.shapes[shape.id] = shape;
          }
          for (const c of connectors) {
            if (s.scene.shapes[c.fromId] && s.scene.shapes[c.toId]) s.scene.connectors[c.id] = c;
          }
          s.lastChange = "edit";
        }),

      updateShape: (id, patch) =>
        set((s) => {
          const shape = s.scene.shapes[id];
          if (!shape) return;
          Object.assign(shape, patch);
          s.lastChange = "edit";
        }),

      updateShapes: (patches) =>
        set((s) => {
          for (const [id, patch] of Object.entries(patches)) {
            const shape = s.scene.shapes[id];
            if (shape) Object.assign(shape, patch);
          }
          s.lastChange = "edit";
        }),

      updateStyle: (ids, style) =>
        set((s) => {
          for (const id of ids) {
            const shape = s.scene.shapes[id];
            if (shape) Object.assign(shape.style, style);
          }
          s.lastChange = "edit";
        }),

      deleteItems: (ids) =>
        set((s) => {
          const gone = new Set(ids);
          for (const id of ids) {
            delete s.scene.shapes[id];
            delete s.scene.connectors[id];
          }
          if (s.scene.order.some((id) => gone.has(id))) {
            s.scene.order = s.scene.order.filter((id) => !gone.has(id));
          }
          // Connectors can't point at missing shapes (the schema rejects them).
          for (const [cid, c] of Object.entries(s.scene.connectors)) {
            if (gone.has(c.fromId) || gone.has(c.toId)) delete s.scene.connectors[cid];
          }
          s.lastChange = "edit";
        }),

      reorder: (ids, direction) =>
        set((s) => {
          s.scene.order = reorderIds(s.scene.order, ids, direction);
          s.lastChange = "edit";
        }),

      duplicate: (ids) => {
        const { scene } = get();
        const selected = new Set(ids);
        // Back to front, so the copies stack the same way as the originals.
        const originals = scene.order.filter((id) => selected.has(id));
        const newIds = new Map(originals.map((id) => [id, crypto.randomUUID()]));
        set((s) => {
          for (const [oldId, newId] of newIds) {
            const copy = structuredClone(scene.shapes[oldId]!);
            copy.id = newId;
            copy.x += DUPLICATE_OFFSET;
            copy.y += DUPLICATE_OFFSET;
            s.scene.shapes[newId] = copy;
            s.scene.order.push(newId);
          }
          for (const c of Object.values(scene.connectors)) {
            const fromId = newIds.get(c.fromId);
            const toId = newIds.get(c.toId);
            if (!fromId || !toId) continue;
            const id = crypto.randomUUID();
            s.scene.connectors[id] = { ...structuredClone(c), id, fromId, toId };
          }
          s.lastChange = "edit";
        });
        return [...newIds.values()];
      },

      addConnector: (fromId, toId) => {
        const id = crypto.randomUUID();
        set((s) => {
          if (!s.scene.shapes[fromId] || !s.scene.shapes[toId]) return;
          s.scene.connectors[id] = { id, fromId, toId, style: { ...DEFAULT_CONNECTOR_STYLE } };
          s.lastChange = "edit";
        });
        return id;
      },

      updateConnectors: (ids, { style, ...rest }) =>
        set((s) => {
          for (const id of ids) {
            const c = s.scene.connectors[id];
            if (!c) continue;
            Object.assign(c, rest);
            if (style) Object.assign(c.style, style);
          }
          s.lastChange = "edit";
        }),

      setConnectorLabel: (id, label) =>
        set((s) => {
          const c = s.scene.connectors[id];
          if (!c) return;
          const text = label.trim();
          if (text) c.label = text;
          else delete c.label;
          s.lastChange = "edit";
        }),
    })),
    {
      // Only the scene is undoable; `lastChange` is bookkeeping.
      partialize: (state): Tracked => ({ scene: state.scene }),
      limit: HISTORY_LIMIT,
      // No history entry for updates that didn't change anything.
      equality: (a, b) => sameScene(a.scene, b.scene),
    },
  ),
);

/** The scene before an open history batch, or null if none is open. */
let batch: Tracked | null = null;

/**
 * Starts grouping scene changes into one undo step, for gestures that need several store
 * actions (e.g. creating a text shape and then typing into it). Ended by `endHistoryBatch`.
 * Nested calls are ignored.
 */
export function beginHistoryBatch(): void {
  if (batch) return;
  batch = { scene: useSceneStore.getState().scene };
  useSceneStore.temporal.getState().pause();
}

/** Ends the open batch, recording it as one undo step if it changed anything. */
export function endHistoryBatch(): void {
  if (!batch) return;
  const before = batch;
  batch = null;
  const history = useSceneStore.temporal;
  history.getState().resume();
  if (sameScene(before.scene, useSceneStore.getState().scene)) return;
  history.setState((h) => ({
    pastStates: [...h.pastStates, before].slice(-HISTORY_LIMIT),
    futureStates: [],
  }));
}
