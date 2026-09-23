import type { Shape } from "@whiteboard/shared";
import { STICKY_COLORS } from "@/store/uiStore";
import type { Vec2 } from "./coords";
import { createBoxShape, createTextShape, defaultBox } from "./defaults";

/** Drag data type for presets dragged from the shape drawer onto the canvas. */
export const PRESET_MIME = "application/x-whiteboard-preset";

export interface ShapePreset {
  id: string;
  label: string;
  /** Builds the shape centred on `at` (world coordinates). */
  create: (at: Vec2) => Shape;
}

function textPreset(id: string, label: string, text: string, fontSize: number, bold: boolean) {
  return {
    id,
    label,
    create: (at: Vec2) => {
      const shape = createTextShape(at, {
        text,
        style: { fontSize, fontWeight: bold ? "bold" : "normal" },
      });
      return { ...shape, x: at.x - shape.width / 2 };
    },
  } satisfies ShapePreset;
}

export const SHAPE_PRESETS: ShapePreset[] = [
  {
    id: "rect",
    label: "Rectangle",
    create: (at) => createBoxShape("rect", defaultBox("rect", at)),
  },
  {
    id: "rounded-rect",
    label: "Rounded rectangle",
    create: (at) => createBoxShape("rect", defaultBox("rect", at), { cornerRadius: 16 }),
  },
  {
    id: "ellipse",
    label: "Ellipse",
    create: (at) => createBoxShape("ellipse", defaultBox("ellipse", at)),
  },
  {
    id: "diamond",
    label: "Diamond",
    create: (at) => createBoxShape("diamond", defaultBox("diamond", at)),
  },
  textPreset("heading", "Heading", "Heading", 40, true),
  textPreset("body", "Body text", "Body text", 18, false),
  ...STICKY_COLORS.map((fill) => ({
    id: `sticky-${fill}`,
    label: "Sticky note",
    create: (at: Vec2) => createBoxShape("sticky", defaultBox("sticky", at), { fill }),
  })),
];

export const presetById = (id: string) => SHAPE_PRESETS.find((p) => p.id === id);
