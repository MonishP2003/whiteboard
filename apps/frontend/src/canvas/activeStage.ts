import type Konva from "konva";

/** The editor's Konva stage, for code outside the canvas tree (e.g. export). */
let stage: Konva.Stage | null = null;

export function setActiveStage(next: Konva.Stage | null): void {
  stage = next;
}

export function getActiveStage(): Konva.Stage | null {
  return stage;
}
