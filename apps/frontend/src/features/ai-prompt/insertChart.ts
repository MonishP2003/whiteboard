import type { ChartResponse, ImageShape } from "@whiteboard/shared";
import { fitToBox, viewportCentreWorld } from "@/canvas/viewport";
import { CHART_SIZE, renderChart } from "@/lib/renderChart";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { placeContent } from "./placement";

/** Renders the chart to an image and adds it at the viewport centre (or beside content). */
export async function insertChart(chart: ChartResponse): Promise<void> {
  const src = await renderChart(chart);
  const existing = Object.values(useSceneStore.getState().scene.shapes);
  const at = placeContent(CHART_SIZE, viewportCentreWorld(), existing);
  const shape: ImageShape = {
    id: crypto.randomUUID(),
    type: "image",
    ...at,
    ...CHART_SIZE,
    rotation: 0,
    src,
    style: { fill: "transparent", stroke: "transparent", strokeWidth: 0, opacity: 1 },
  };

  useSceneStore.getState().insertItems([shape], []);
  const ui = useUiStore.getState();
  ui.setTool("select");
  ui.select([shape.id]);
  fitToBox({ ...at, ...CHART_SIZE });
}
