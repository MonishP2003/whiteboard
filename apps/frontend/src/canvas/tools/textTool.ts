import { beginHistoryBatch, useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { createTextShape } from "../defaults";
import { supportsText } from "../text";
import { addAndSelect, shapeNodeOf, type ToolHandler } from "./types";

/** Click to create a text shape and start typing; click an existing text-capable shape to edit it. */
export const textTool: ToolHandler = {
  onPointerDown(e, pos) {
    // Stops the compat mousedown from moving focus to <body>, which would blur (and so
    // commit and delete) the empty textarea we're about to open.
    e.evt.preventDefault();

    const hit = shapeNodeOf(e.target);
    const existing = hit && useSceneStore.getState().scene.shapes[hit.id()];
    const ui = useUiStore.getState();
    if (existing && supportsText(existing)) {
      ui.select([existing.id]);
      ui.setTool("select");
      ui.setEditingTextId(existing.id);
      return;
    }

    // Creating the shape and typing its text is one undo step; the editor ends the batch.
    beginHistoryBatch();
    const shape = createTextShape(pos);
    addAndSelect(shape);
    ui.setEditingTextId(shape.id);
  },
};
