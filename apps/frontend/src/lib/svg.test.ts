import { describe, expect, test } from "vitest";
import { emptyScene, type Connector, type Scene, type Shape } from "@whiteboard/shared";
import { escapeXml, exportItems, sceneToSvg, type TextLayout } from "./svg";

/** Fixed text metrics: 10 px per character, lines split on "\n" only. */
const fakeLayout: TextLayout = {
  shapeText(shape) {
    const text = shape.text ?? "";
    return { fontSize: shape.style.fontSize ?? 18, lines: text ? text.split("\n") : [] };
  },
  label(text) {
    const lines = text.split("\n");
    return {
      width: Math.max(...lines.map((l) => l.length)) * 10,
      height: lines.length * 17.5,
      lines,
    };
  },
};

const style = { fill: "#ffffff", stroke: "#1f2937", strokeWidth: 2, opacity: 1 };

const shapes: Shape[] = [
  { id: "r", type: "rect", x: 0, y: 0, width: 160, height: 100, rotation: 0, style, text: "Start" },
  {
    id: "e",
    type: "ellipse",
    x: 300,
    y: 0,
    width: 160,
    height: 100,
    rotation: 30,
    style: { ...style, fill: "transparent", opacity: 0.5 },
  },
  {
    id: "s",
    type: "sticky",
    x: 0,
    y: 200,
    width: 200,
    height: 200,
    rotation: 0,
    style: { fill: "#fff59d", stroke: "transparent", strokeWidth: 0, opacity: 1, fontSize: 24 },
    text: 'Buy <milk>\n& "eggs"',
  },
  {
    id: "t",
    type: "text",
    x: 300,
    y: 250,
    width: 240,
    rotation: 0,
    style: { fill: "#1f2937", stroke: "transparent", strokeWidth: 0, opacity: 1, fontSize: 24 },
    text: "Heading",
  },
  {
    id: "f",
    type: "freehand",
    x: 600,
    y: 0,
    rotation: 0,
    style: { fill: "transparent", stroke: "#ef4444", strokeWidth: 3, opacity: 1 },
    points: [0, 0, 20, 30, 40, 0, 60, 30],
  },
  {
    id: "i",
    type: "image",
    x: 600,
    y: 200,
    width: 40,
    height: 20,
    rotation: 0,
    style,
    src: "data:image/png;base64,AAAA",
  },
];

const connectors: Connector[] = [
  { id: "c1", fromId: "r", toId: "e", style, label: "yes" },
  {
    id: "c2",
    fromId: "r",
    toId: "s",
    style: { ...style, stroke: "#3b82f6" },
    dashed: true,
    arrowStart: true,
    arrowEnd: false,
  },
];

const scene: Scene = {
  ...emptyScene(),
  shapes: Object.fromEntries(shapes.map((s) => [s.id, s])),
  order: shapes.map((s) => s.id),
  connectors: Object.fromEntries(connectors.map((c) => [c.id, c])),
};

describe("sceneToSvg", () => {
  test("serializes every shape type, rotation, text and arrows", () => {
    expect(sceneToSvg(scene, fakeLayout)).toMatchSnapshot();
  });

  test("returns null for an empty scene", () => {
    expect(sceneToSvg(emptyScene(), fakeLayout)).toBeNull();
  });

  test("escapes text content", () => {
    const svg = sceneToSvg(scene, fakeLayout)!;
    expect(svg).toContain("Buy &lt;milk&gt;");
    expect(svg).toContain("&amp; &quot;eggs&quot;");
    expect(svg).not.toContain("<milk>");
  });

  test("crops the viewBox to the content plus padding", () => {
    const one: Scene = { ...emptyScene(), shapes: { r: shapes[0]! }, order: ["r"] };
    const svg = sceneToSvg(one, fakeLayout, { padding: 10 })!;
    expect(svg).toContain('viewBox="-10 -10 180 120"');
  });
});

describe("exportItems", () => {
  test("keeps selected shapes, selected connectors and connectors between selected shapes", () => {
    const items = exportItems(scene, ["r", "s", "c1"]);
    expect(items.shapes.map((s) => s.id)).toEqual(["r", "s"]);
    expect(items.connectors.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });
});

test("escapeXml", () => {
  expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
    "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
  );
});

test("diamonds export as a polygon with their label", () => {
  const scene: Scene = {
    ...emptyScene(),
    shapes: {
      d: {
        id: "d",
        type: "diamond",
        x: 0,
        y: 0,
        width: 100,
        height: 60,
        rotation: 0,
        style,
        text: "OK?",
      },
    },
    order: ["d"],
  };
  const svg = sceneToSvg(scene, fakeLayout)!;
  expect(svg).toContain('<polygon points="50,0 100,30 50,60 0,30"');
  expect(svg).toContain(">OK?</tspan>");
});
