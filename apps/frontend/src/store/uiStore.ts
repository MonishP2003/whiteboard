import { create } from "zustand";

export type Tool =
  "select" | "pan" | "rect" | "ellipse" | "text" | "sticky" | "freehand" | "connector";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

/** Miro's sticky note colours. The first is the default. */
export const STICKY_COLORS = [
  "#fff59d",
  "#ffcc80",
  "#f8bbd0",
  "#e1bee7",
  "#b3e5fc",
  "#c8e6c9",
  "#e0e0e0",
] as const;

/** Editor state that is neither saved nor undoable. */
interface UiState {
  activeTool: Tool;
  /** Shape and connector IDs (both are UUIDs, so they never collide). */
  selectedIds: string[];
  viewport: Viewport;
  /** Size of the canvas element in screen pixels. */
  canvasSize: { width: number; height: number };
  /** The shape, or connector label, whose text editor is open. */
  editingTextId: string | null;
  /** Space is held down: dragging pans instead of using the active tool. */
  panKeyHeld: boolean;
  shapeDrawerOpen: boolean;
  /** Fill for new stickies. Kept when switching boards. */
  stickyColor: string;
  setTool: (tool: Tool) => void;
  select: (ids: string[]) => void;
  setViewport: (viewport: Viewport) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setEditingTextId: (id: string | null) => void;
  setPanKeyHeld: (held: boolean) => void;
  setShapeDrawerOpen: (open: boolean) => void;
  setStickyColor: (color: string) => void;
  reset: () => void;
}

const initial = {
  activeTool: "select" as Tool,
  selectedIds: [] as string[],
  viewport: { x: 0, y: 0, scale: 1 },
  canvasSize: { width: 0, height: 0 },
  editingTextId: null as string | null,
  panKeyHeld: false,
  shapeDrawerOpen: false,
};

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  stickyColor: STICKY_COLORS[0],
  setTool: (activeTool) => set({ activeTool }),
  select: (selectedIds) => set({ selectedIds }),
  setViewport: (viewport) => set({ viewport }),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setEditingTextId: (editingTextId) => set({ editingTextId }),
  setPanKeyHeld: (panKeyHeld) => set({ panKeyHeld }),
  setShapeDrawerOpen: (shapeDrawerOpen) => set({ shapeDrawerOpen }),
  setStickyColor: (stickyColor) => set({ stickyColor }),
  reset: () => set(initial),
}));
