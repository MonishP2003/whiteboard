import type { ChartConfiguration, Plugin } from "chart.js";
import type { ChartResponse } from "@whiteboard/shared";
import { DEFAULT_FONT_FAMILY } from "@/canvas/text";

/** Size of the inserted image in world units; the bitmap is PIXEL_RATIO× that. */
export const CHART_SIZE = { width: 800, height: 500 } as const;
const PIXEL_RATIO = 2;
/** Stay well under the scene's image limit (and the 2 MB board save body). */
const MAX_DATA_URL_LENGTH = 800_000;

/** Categorical slots, assigned in this order and never cycled. */
const SERIES_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];
const TEXT_PRIMARY = "#0b0b0b";
const TEXT_SECONDARY = "#52514e";
const GRID = "#e7e6e2";
const BACKGROUND = "#ffffff";

const whiteBackground: Plugin = {
  id: "whiteBackground",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

/** A pie has at most one slice per colour; the smallest slices past that fold into "Other". */
function foldPie(labels: string[], data: number[]): { labels: string[]; data: number[] } {
  if (labels.length <= SERIES_COLORS.length) return { labels, data };
  const ranked = labels.map((label, i) => ({ label, value: data[i]! }));
  ranked.sort((a, b) => b.value - a.value);
  const kept = ranked.slice(0, SERIES_COLORS.length - 1);
  const other = ranked.slice(SERIES_COLORS.length - 1).reduce((sum, s) => sum + s.value, 0);
  return {
    labels: [...kept.map((s) => s.label), "Other"],
    data: [...kept.map((s) => s.value), other],
  };
}

function chartConfig(chart: ChartResponse): ChartConfiguration {
  const font = { family: DEFAULT_FONT_FAMILY };
  const title = {
    display: chart.title.length > 0,
    text: chart.title,
    color: TEXT_PRIMARY,
    font: { ...font, size: 20, weight: "bold" as const },
    padding: { bottom: 16 },
  };
  const legendLabels = { color: TEXT_SECONDARY, font: { ...font, size: 14 }, boxWidth: 14 };

  if (chart.type === "pie") {
    const { labels, data } = foldPie(chart.labels, chart.series[0]!.data);
    return {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            label: chart.series[0]!.name,
            data,
            backgroundColor: SERIES_COLORS.slice(0, data.length),
            borderColor: BACKGROUND,
            borderWidth: 2,
          },
        ],
      },
      options: {
        plugins: { title, legend: { position: "right", labels: legendLabels } },
      },
    };
  }

  const axis = {
    grid: { color: GRID },
    border: { color: GRID },
    ticks: { color: TEXT_SECONDARY, font: { ...font, size: 13 } },
  };
  const many = chart.series.length > 1;
  return {
    type: chart.type,
    data: {
      labels: chart.labels,
      datasets: chart.series.map((s, i) => {
        const color = SERIES_COLORS[i]!;
        return chart.type === "bar"
          ? {
              label: s.name,
              data: s.data,
              backgroundColor: color,
              borderRadius: 4,
              borderSkipped: "start" as const,
              // A thin surface gap between adjacent bars.
              borderColor: BACKGROUND,
              borderWidth: many ? 1 : 0,
            }
          : {
              label: s.name,
              data: s.data,
              borderColor: color,
              backgroundColor: color,
              borderWidth: 2,
              pointRadius: 4,
              pointBorderColor: BACKGROUND,
              pointBorderWidth: 2,
              tension: 0,
            };
      }),
    },
    options: {
      plugins: {
        title,
        // One series needs no legend box; the title names it.
        legend: { display: many, position: "top", labels: legendLabels },
      },
      scales: {
        x: { ...axis, grid: { display: false }, border: { color: GRID } },
        y: { ...axis, beginAtZero: true },
      },
    },
  };
}

/**
 * Draws the chart on an offscreen canvas and returns it as a data URL: PNG normally, WebP
 * if the PNG would be too large to store in the board.
 */
export async function renderChart(chart: ChartResponse): Promise<string> {
  const { default: Chart } = await import("chart.js/auto");
  const canvas = document.createElement("canvas");
  // Chart.js scales the bitmap to `devicePixelRatio` itself.
  canvas.width = CHART_SIZE.width;
  canvas.height = CHART_SIZE.height;
  const config = chartConfig(chart);
  const instance = new Chart(canvas, {
    ...config,
    options: {
      ...config.options,
      animation: false,
      responsive: false,
      // Otherwise `resize` fits the chart's default aspect ratio (2:1, or 1:1 for pies).
      maintainAspectRatio: false,
      devicePixelRatio: PIXEL_RATIO,
      layout: { padding: 24 },
    },
    plugins: [whiteBackground],
  } as ChartConfiguration);
  try {
    // Chart.js sizes the canvas from its CSS size when it isn't in the DOM.
    instance.resize(CHART_SIZE.width, CHART_SIZE.height);
    instance.draw();
    const png = canvas.toDataURL("image/png");
    if (png.length <= MAX_DATA_URL_LENGTH) return png;
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    instance.destroy();
  }
}
