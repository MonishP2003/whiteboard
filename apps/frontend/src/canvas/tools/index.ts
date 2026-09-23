import type { Tool } from "@/store/uiStore";
import { createBoxTool } from "./boxTool";
import { createConnectorTool } from "./connectorTool";
import { createFreehandTool } from "./freehandTool";
import { createSelectTool } from "./selectTool";
import { textTool } from "./textTool";
import type { ToolHandler } from "./types";

/** Panning (pan tool, space, middle mouse) is handled by `Stage.tsx` itself. */
export const tools: Record<Tool, ToolHandler> = {
  select: createSelectTool(),
  pan: {},
  rect: createBoxTool("rect"),
  ellipse: createBoxTool("ellipse"),
  sticky: createBoxTool("sticky"),
  text: textTool,
  freehand: createFreehandTool(),
  connector: createConnectorTool(),
};

export const toolCursor: Record<Tool, string> = {
  select: "default",
  pan: "grab",
  rect: "crosshair",
  ellipse: "crosshair",
  sticky: "crosshair",
  text: "text",
  freehand: "crosshair",
  connector: "crosshair",
};
