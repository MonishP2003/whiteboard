import { create } from "zustand";
import type { Style } from "@whiteboard/shared";

/**
 * A style change the user is still making (e.g. a slider being dragged), drawn on top of
 * the stored style. The scene store only gets the final value, as one change, when the
 * gesture ends — so autosave and undo see one edit, not one per frame. Never saved.
 */
export interface StylePreview {
  ids: string[];
  style: Partial<Style>;
}

interface PreviewState {
  preview: StylePreview | null;
  setPreview: (preview: StylePreview | null) => void;
}

export const usePreviewStore = create<PreviewState>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
