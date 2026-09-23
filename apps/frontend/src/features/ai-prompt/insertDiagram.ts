import type { Connector, DiagramNodeKind, DiagramResponse, Shape, Style } from "@whiteboard/shared";
import { unionBounds } from "@/canvas/bounds";
import type { Box } from "@/canvas/coords";
import { createBoxShape, type PresetBoxType } from "@/canvas/defaults";
import { CONNECTOR_LABEL, measureLabel, measureTextBlock } from "@/canvas/text";
import { fitToBox, viewportCentreWorld } from "@/canvas/viewport";
import { layoutGraph, type LayoutEdge, type LayoutNode } from "@/lib/elkLayout";
import { DEFAULT_CONNECTOR_STYLE, useSceneStore } from "@/store/sceneStore";
import { STICKY_COLORS, useUiStore } from "@/store/uiStore";
import { placeContent } from "./placement";

const FONT_SIZE = 18;

interface KindSpec {
  shape: PresetBoxType;
  style: Partial<Style>;
  /** Widest the label may be before it wraps. */
  maxTextWidth: number;
  /** Node size for a label of `text` size. */
  size: (text: { width: number; height: number }) => { width: number; height: number };
}

const stroke = (color: string) => ({ stroke: color, strokeWidth: 2 });

/*
 * Sizes leave the label room inside each shape's text box (see `textBox` in canvas/text.ts):
 * rects inset 8px, stickies 16px, ellipses 15% and diamonds 25% of each side.
 */
const KINDS: Record<DiagramNodeKind, KindSpec> = {
  process: {
    shape: "rect",
    style: { fill: "#ffffff", ...stroke("#1f2937"), cornerRadius: 8 },
    maxTextWidth: 180,
    size: (t) => ({ width: Math.max(140, t.width + 40), height: Math.max(64, t.height + 36) }),
  },
  data: {
    shape: "rect",
    style: { fill: "#dbeafe", ...stroke("#1d4ed8"), cornerRadius: 0 },
    maxTextWidth: 180,
    size: (t) => ({ width: Math.max(140, t.width + 40), height: Math.max(64, t.height + 36) }),
  },
  start: {
    shape: "ellipse",
    style: { fill: "#dcfce7", ...stroke("#15803d") },
    maxTextWidth: 160,
    size: (t) => ({
      width: Math.max(130, (t.width + 12) / 0.7),
      height: Math.max(64, (t.height + 12) / 0.7),
    }),
  },
  end: {
    shape: "ellipse",
    style: { fill: "#fee2e2", ...stroke("#b91c1c") },
    maxTextWidth: 160,
    size: (t) => ({
      width: Math.max(130, (t.width + 12) / 0.7),
      height: Math.max(64, (t.height + 12) / 0.7),
    }),
  },
  decision: {
    shape: "diamond",
    style: { fill: "#fef9c3", ...stroke("#a16207") },
    maxTextWidth: 140,
    size: (t) => ({
      width: Math.max(170, (t.width + 12) / 0.5),
      height: Math.max(100, (t.height + 12) / 0.5),
    }),
  },
  note: {
    shape: "sticky",
    style: { fill: STICKY_COLORS[0] },
    maxTextWidth: 180,
    size: (t) => ({ width: Math.max(160, t.width + 44), height: Math.max(100, t.height + 44) }),
  },
};

export interface DiagramDeps {
  measureText: (
    text: string,
    fontSize: number,
    maxWidth: number,
  ) => { width: number; height: number };
  measureEdgeLabel: (text: string) => { width: number; height: number };
  layout: (nodes: LayoutNode[], edges: LayoutEdge[]) => Promise<Map<string, Box>>;
}

const defaultDeps: DiagramDeps = {
  measureText: measureTextBlock,
  measureEdgeLabel: (text) => {
    const { width, height } = measureLabel(text);
    const pad = CONNECTOR_LABEL.padding * 2;
    return { width: width + pad, height: height + pad };
  },
  layout: layoutGraph,
};

/**
 * Turns the AI's nodes and edges into shapes and connectors, laid out top-down with the
 * diagram's top-left at (0, 0). Shape IDs are fresh UUIDs, never the AI's IDs.
 */
export async function buildDiagram(
  diagram: DiagramResponse,
  deps: DiagramDeps = defaultDeps,
): Promise<{ shapes: Shape[]; connectors: Connector[] }> {
  const specs = new Map(diagram.nodes.map((n) => [n.id, KINDS[n.kind]]));
  const layoutNodes = diagram.nodes.map((n): LayoutNode => {
    const spec = KINDS[n.kind];
    const size = spec.size(deps.measureText(n.label, FONT_SIZE, spec.maxTextWidth));
    return { id: n.id, width: Math.round(size.width), height: Math.round(size.height) };
  });
  const layoutEdges = diagram.edges.map((e): LayoutEdge => ({
    from: e.from,
    to: e.to,
    label: e.label ? deps.measureEdgeLabel(e.label) : undefined,
  }));
  const boxes = await deps.layout(layoutNodes, layoutEdges);

  const shapeIds = new Map<string, string>();
  const shapes = diagram.nodes.flatMap((n): Shape[] => {
    const spec = specs.get(n.id)!;
    const box = boxes.get(n.id);
    if (!box) return [];
    const shape = createBoxShape(spec.shape, box, { ...spec.style, fontSize: FONT_SIZE });
    shape.text = n.label;
    shapeIds.set(n.id, shape.id);
    return [shape];
  });
  const connectors = diagram.edges.flatMap((e): Connector[] => {
    const fromId = shapeIds.get(e.from);
    const toId = shapeIds.get(e.to);
    if (!fromId || !toId) return [];
    const c: Connector = {
      id: crypto.randomUUID(),
      fromId,
      toId,
      style: { ...DEFAULT_CONNECTOR_STYLE },
    };
    if (e.label) c.label = e.label;
    return [c];
  });
  return { shapes, connectors };
}

/**
 * Lays out the diagram and adds it to the board as one undo step, placed at the viewport
 * centre (or beside existing content), then selects it and fits the view to it.
 */
export async function insertDiagram(diagram: DiagramResponse): Promise<void> {
  const { shapes, connectors } = await buildDiagram(diagram);
  const box = unionBounds(shapes);
  if (!box) return;
  const existing = Object.values(useSceneStore.getState().scene.shapes);
  const at = placeContent(box, viewportCentreWorld(), existing);
  const dx = at.x - box.x;
  const dy = at.y - box.y;
  for (const s of shapes) {
    s.x += dx;
    s.y += dy;
  }

  useSceneStore.getState().insertItems(shapes, connectors);
  const ui = useUiStore.getState();
  ui.setTool("select");
  ui.select(shapes.map((s) => s.id));
  fitToBox({ ...box, x: at.x, y: at.y });
}
