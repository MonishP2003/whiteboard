import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { Box } from "@/canvas/coords";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** Size of the edge's label, so ELK leaves room for it between layers. */
  label?: { width: number; height: number };
}

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "50",
  "elk.layered.spacing.nodeNodeBetweenLayers": "70",
  "elk.spacing.edgeLabel": "8",
  "elk.spacing.componentComponent": "80",
  "elk.edgeLabels.placement": "CENTER",
  // Keep the model's node order where it doesn't cost crossings; it's usually the flow order.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

type Elk = { layout(graph: ElkNode): Promise<ElkNode> };
let elk: Promise<Elk> | undefined;

/** elkjs is over 1 MB, so it's only loaded the first time a diagram is laid out. */
function loadElk(): Promise<Elk> {
  elk ??= import("elkjs/lib/elk.bundled.js").then(({ default: ELK }) => new ELK());
  return elk;
}

/** Starts downloading elkjs without laying anything out, e.g. when the prompt bar is used. */
export function preloadElk(): void {
  loadElk().catch(() => {
    elk = undefined;
  });
}

/**
 * Lays out a directed graph top-down with ELK's layered algorithm. Returns each node's box,
 * with the graph's top-left at (0, 0).
 */
export async function layoutGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): Promise<Map<string, Box>> {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges.map((e, i): ElkExtendedEdge => ({
      id: `e${i}`,
      sources: [e.from],
      targets: [e.to],
      labels: e.label ? [{ id: `e${i}-label`, text: "", ...e.label }] : undefined,
    })),
  };
  const result = await (await loadElk()).layout(graph);
  const boxes = new Map<string, Box>();
  for (const c of result.children ?? []) {
    boxes.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 });
  }
  return boxes;
}
