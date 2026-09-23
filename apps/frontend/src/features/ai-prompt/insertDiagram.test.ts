import { describe, expect, test } from "vitest";
import type { DiagramResponse, Shape } from "@whiteboard/shared";
import { shapeBounds } from "@/canvas/bounds";
import { layoutGraph } from "@/lib/elkLayout";
import { buildDiagram, type DiagramDeps } from "./insertDiagram";
import { placeContent } from "./placement";

// Real ELK layout; only text measurement is faked (it needs a canvas).
const deps: DiagramDeps = {
  measureText: (text, fontSize, maxWidth) => {
    const width = text.length * fontSize * 0.55;
    const lines = Math.ceil(width / maxWidth);
    return { width: Math.min(width, maxWidth), height: lines * fontSize * 1.25 };
  },
  measureEdgeLabel: (text) => ({ width: text.length * 8 + 8, height: 26 }),
  layout: layoutGraph,
};

const checkout: DiagramResponse = {
  nodes: [
    { id: "start", label: "Customer opens cart", kind: "start" },
    { id: "review", label: "Review items", kind: "process" },
    { id: "logged_in", label: "Logged in?", kind: "decision" },
    { id: "login", label: "Log in or continue as guest", kind: "process" },
    { id: "pay", label: "Enter payment details", kind: "process" },
    { id: "db", label: "Orders database", kind: "data" },
    { id: "ok", label: "Payment approved?", kind: "decision" },
    { id: "done", label: "Order confirmed", kind: "end" },
    { id: "note", label: "Guest checkout skips account creation", kind: "note" },
  ],
  edges: [
    { from: "start", to: "review" },
    { from: "review", to: "logged_in" },
    { from: "logged_in", to: "login", label: "No" },
    { from: "logged_in", to: "pay", label: "Yes" },
    { from: "login", to: "pay" },
    { from: "pay", to: "ok" },
    { from: "ok", to: "pay", label: "No" },
    { from: "ok", to: "db", label: "Yes" },
    { from: "db", to: "done" },
  ],
};

const overlap = (a: Shape, b: Shape) => {
  const p = shapeBounds(a);
  const q = shapeBounds(b);
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
};

describe("buildDiagram", () => {
  test("maps kinds to shapes, with fresh IDs and labels", async () => {
    const { shapes } = await buildDiagram(checkout, deps);
    expect(shapes.map((s) => s.type)).toEqual([
      "ellipse",
      "rect",
      "diamond",
      "rect",
      "rect",
      "rect",
      "diamond",
      "ellipse",
      "sticky",
    ]);
    expect(shapes.map((s) => ("text" in s ? s.text : undefined))).toEqual(
      checkout.nodes.map((n) => n.label),
    );
    expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length);
    expect(shapes.some((s) => checkout.nodes.some((n) => n.id === s.id))).toBe(false);
  });

  test("connectors follow the edges, with labels", async () => {
    const { shapes, connectors } = await buildDiagram(checkout, deps);
    const byLabel = new Map(shapes.map((s) => [(s as { text?: string }).text, s.id]));
    expect(connectors).toHaveLength(checkout.edges.length);
    expect(connectors[2]).toMatchObject({
      fromId: byLabel.get("Logged in?"),
      toId: byLabel.get("Log in or continue as guest"),
      label: "No",
    });
    expect(connectors[0]!.label).toBeUndefined();
  });

  test("lays out top-down with no overlapping nodes", async () => {
    const { shapes } = await buildDiagram(checkout, deps);
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        expect(overlap(shapes[i]!, shapes[j]!), `${i} overlaps ${j}`).toBe(false);
      }
    }
    const y = (label: string) => shapes.find((s) => "text" in s && s.text === label)!.y;
    expect(y("Customer opens cart")).toBeLessThan(y("Review items"));
    expect(y("Review items")).toBeLessThan(y("Logged in?"));
    expect(y("Enter payment details")).toBeLessThan(y("Order confirmed"));
  });
});

describe("placeContent", () => {
  const style = { fill: "#fff", stroke: "#000", strokeWidth: 2, opacity: 1 };
  const rect = (x: number, y: number): Shape => ({
    id: `r${x}`,
    type: "rect",
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    style,
  });

  test("centres on the viewport when that spot is empty", () => {
    expect(placeContent({ width: 200, height: 100 }, { x: 0, y: 0 }, [rect(500, 500)])).toEqual({
      x: -100,
      y: -50,
    });
  });

  test("goes right of existing content when the centre is taken", () => {
    const at = placeContent({ width: 200, height: 100 }, { x: 0, y: 0 }, [
      rect(-50, -50),
      rect(300, 200),
    ]);
    expect(at).toEqual({ x: 400 + 120, y: -50 });
  });
});
