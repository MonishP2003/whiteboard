import Konva from "konva";
import type { ShapePatch } from "@/store/sceneStore";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { useLiveStore } from "../connectors/liveStore";
import { boxFromCorners, type Box, type Vec2 } from "../coords";
import { useDraftStore } from "../draftStore";
import { supportsText } from "../text";
import { connectorNodeOf, shapeNodeOf, type ToolHandler } from "./types";

type Gesture =
  | { kind: "marquee"; start: Vec2; base: string[]; rects: { id: string; rect: Box }[] }
  /** Pressed a shape or connector that's already part of a multi-selection. */
  | { kind: "press"; id: string; dragged: boolean };

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Click to select (shapes or connectors), shift-click to toggle, drag on empty canvas for a
 * marquee, drag a shape to move the selection (Konva drags the nodes; the store is updated
 * once on dragend).
 */
export function createSelectTool(): ToolHandler {
  let gesture: Gesture | null = null;
  /** Nodes that ended a drag this tick; the Transformer drags every selected node along. */
  const dragged = new Map<string, Konva.Node>();

  const commitDrag = () => {
    const patches: Record<string, ShapePatch> = {};
    for (const [id, node] of dragged) patches[id] = { x: node.x(), y: node.y() };
    dragged.clear();
    useSceneStore.getState().updateShapes(patches);
    // Connectors now read the committed positions.
    useLiveStore.getState().clear();
  };

  return {
    onPointerDown(e, pos) {
      gesture = null;
      // Transformer anchors handle themselves.
      if (e.target.findAncestor("Transformer", true)) return;

      const ui = useUiStore.getState();
      const shift = e.evt.shiftKey;
      const node = shapeNodeOf(e.target) ?? connectorNodeOf(e.target);
      if (node) {
        const id = node.id();
        const selected = ui.selectedIds.includes(id);
        if (shift) {
          ui.select(selected ? ui.selectedIds.filter((x) => x !== id) : [...ui.selectedIds, id]);
        } else if (!selected) {
          ui.select([id]);
        } else if (ui.selectedIds.length > 1) {
          // Might be the start of moving the whole selection; decided on pointer up.
          gesture = { kind: "press", id, dragged: false };
        }
        return;
      }

      // Empty canvas: start a marquee. Client rects are measured once, up front.
      const layer = e.target.getStage()?.findOne<Konva.Layer>(".shapes-layer");
      const rects = (layer?.find(".shape") ?? []).map((n) => ({
        id: n.id(),
        rect: n.getClientRect({ relativeTo: layer }),
      }));
      gesture = { kind: "marquee", start: pos, base: shift ? ui.selectedIds : [], rects };
      if (!shift) ui.select([]);
    },

    onPointerMove(_e, pos) {
      if (gesture?.kind !== "marquee") return;
      const box = boxFromCorners(gesture.start, pos);
      useDraftStore.getState().setDraft({ kind: "marquee", ...box });

      const hits = gesture.rects
        .filter((r) => Konva.Util.haveIntersection(r.rect, box))
        .map((r) => r.id);
      const next = [...new Set([...gesture.base, ...hits])];
      const ui = useUiStore.getState();
      if (!sameIds(next, ui.selectedIds)) ui.select(next);
    },

    onPointerUp() {
      if (gesture?.kind === "marquee") useDraftStore.getState().setDraft(null);
      if (gesture?.kind === "press" && !gesture.dragged) useUiStore.getState().select([gesture.id]);
      gesture = null;
    },

    onDoubleClick(e) {
      const connector = connectorNodeOf(e.target);
      if (connector) {
        const ui = useUiStore.getState();
        ui.select([connector.id()]);
        ui.setEditingTextId(connector.id());
        return;
      }
      const node = shapeNodeOf(e.target);
      const shape = node && useSceneStore.getState().scene.shapes[node.id()];
      if (!shape || !supportsText(shape)) return;
      const ui = useUiStore.getState();
      ui.select([shape.id]);
      ui.setEditingTextId(shape.id);
    },

    onDragStart() {
      if (gesture?.kind === "press") gesture.dragged = true;
    },

    onDragEnd(e) {
      // Also fires for Transformer anchors, which aren't shapes.
      if (!e.target.hasName("shape")) return;
      // dragend fires once per dragged node in the same tick; commit them as one change.
      if (dragged.size === 0) queueMicrotask(commitDrag);
      dragged.set(e.target.id(), e.target);
    },

    cancel() {
      const active = gesture?.kind === "marquee";
      if (active) useDraftStore.getState().setDraft(null);
      gesture = null;
      return active;
    },
  };
}
