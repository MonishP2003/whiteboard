import { create } from "zustand";
import type { Box, Vec2 } from "./coords";
import type { BoxShapeType } from "./defaults";

/** In-progress gestures drawn in the overlay layer. Never saved. */
export type Draft =
  | ({ kind: BoxShapeType | "marquee" } & Box)
  | { kind: "freehand"; points: number[] }
  /**
   * A connector being drawn from `fromId` to the pointer, or (with no `fromId`) just the
   * connector tool hovering. `targetId` is the shape under the pointer, highlighted.
   */
  | { kind: "connector"; fromId: string | null; to: Vec2; targetId: string | null };

interface DraftState {
  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
}

export const useDraftStore = create<DraftState>()((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}));
