import { useStore } from "zustand";
import { usePreviewStore } from "@/canvas/previewStore";
import { useSceneStore } from "./sceneStore";
import { useUiStore } from "./uiStore";

/** Drops selected or edited IDs that the scene no longer has. */
function pruneUi() {
  const { shapes, connectors } = useSceneStore.getState().scene;
  const exists = (id: string) => id in shapes || id in connectors;
  const ui = useUiStore.getState();
  const kept = ui.selectedIds.filter(exists);
  if (kept.length !== ui.selectedIds.length) ui.select(kept);
  if (ui.editingTextId && !exists(ui.editingTextId)) ui.setEditingTextId(null);
}

/**
 * Commits an open text edit (its editor saves on blur) and drops any slider preview, so
 * undo steps over finished changes only.
 */
function settle() {
  if (useUiStore.getState().editingTextId && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  usePreviewStore.getState().setPreview(null);
}

export function undo(): void {
  settle();
  useSceneStore.temporal.getState().undo();
  pruneUi();
}

export function redo(): void {
  settle();
  useSceneStore.temporal.getState().redo();
  pruneUi();
}

export function useCanUndo(): boolean {
  return useStore(useSceneStore.temporal, (h) => h.pastStates.length > 0);
}

export function useCanRedo(): boolean {
  return useStore(useSceneStore.temporal, (h) => h.futureStates.length > 0);
}
