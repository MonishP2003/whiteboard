import { useEffect } from "react";
import { redo, undo } from "@/store/history";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore, type Tool } from "@/store/uiStore";
import { tools } from "./tools";
import { fitToContent, resetZoom, zoomIn, zoomOut } from "./viewport";

export const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "pan",
  r: "rect",
  o: "ellipse",
  t: "text",
  s: "sticky",
  p: "freehand",
  c: "connector",
};

/** True for inputs, textareas and contenteditables, where keys mean typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
}

/** Canvas keyboard shortcuts, plus space-to-pan. */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ui = useUiStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === " ") {
        // Also stops a focused button from being "clicked" by the space bar.
        e.preventDefault();
        if (!e.repeat) ui.setPanKeyHeld(true);
      } else if (mod && ["z", "y"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        // Abandon a half-drawn shape first, so it can't land on top of the undone scene.
        tools[ui.activeTool].cancel?.();
        if (e.key.toLowerCase() === "y" || e.shiftKey) redo();
        else undo();
      } else if (mod && (e.key === "=" || e.key === "+" || e.code === "NumpadAdd")) {
        // Replaces the browser's page zoom.
        e.preventDefault();
        zoomIn();
      } else if (mod && (e.key === "-" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        zoomOut();
      } else if (e.shiftKey && !mod && !e.altKey && e.code === "Digit1") {
        // `code`, since Shift+1 types "!" (or something else, depending on the layout).
        fitToContent();
      } else if (e.shiftKey && !mod && !e.altKey && e.code === "Digit0") {
        resetZoom();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (ui.selectedIds.length === 0 || ui.editingTextId) return;
        ui.select(useSceneStore.getState().duplicate(ui.selectedIds));
      } else if (mod && (e.code === "BracketRight" || e.code === "BracketLeft")) {
        e.preventDefault();
        if (ui.selectedIds.length === 0) return;
        const up = e.code === "BracketRight";
        const direction = e.shiftKey ? (up ? "front" : "back") : up ? "forward" : "backward";
        useSceneStore.getState().reorder(ui.selectedIds, direction);
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        ui.setTool("select");
        const { order, connectors } = useSceneStore.getState().scene;
        ui.select([...order, ...Object.keys(connectors)]);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (ui.selectedIds.length === 0 || ui.editingTextId) return;
        e.preventDefault();
        useSceneStore.getState().deleteItems(ui.selectedIds);
        ui.select([]);
      } else if (e.key === "Escape") {
        if (tools[ui.activeTool].cancel?.()) return;
        ui.select([]);
        ui.setTool("select");
      } else if (!mod && !e.altKey) {
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) ui.setTool(tool);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") useUiStore.getState().setPanKeyHeld(false);
    };
    // A key released while the window is unfocused never sends keyup.
    const onBlur = () => useUiStore.getState().setPanKeyHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
