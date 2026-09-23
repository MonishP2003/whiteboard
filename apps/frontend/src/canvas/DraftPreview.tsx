import { memo } from "react";
import { Arrow, Ellipse, Line, Rect } from "react-konva";
import { useShallow } from "zustand/react/shallow";
import { DEFAULT_CONNECTOR_STYLE, useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import {
  anchorPoint,
  arrowHeadSize,
  connectorPoints,
  outlineCentre,
  shapeOutline,
  type Outline,
} from "./connectors/geometry";
import { DEFAULT_STYLE } from "./defaults";
import { useDraftStore, type Draft } from "./draftStore";

const HIGHLIGHT = "#3b82f6";

/** Draws the in-progress gesture (shape being sized, marquee, pen stroke). Not interactive. */
export const DraftPreview = memo(function DraftPreview() {
  const draft = useDraftStore((s) => s.draft);
  const scale = useUiStore((s) => s.viewport.scale);
  const stickyColor = useUiStore((s) => s.stickyColor);
  if (!draft) return null;

  switch (draft.kind) {
    case "connector":
      return <ConnectorDraft draft={draft} scale={scale} />;
    case "marquee":
      return (
        <Rect
          {...draft}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="#3b82f6"
          strokeWidth={1 / scale}
          listening={false}
        />
      );
    case "freehand": {
      const style = DEFAULT_STYLE.freehand;
      return (
        <Line
          points={draft.points}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    }
    case "ellipse": {
      const style = DEFAULT_STYLE.ellipse;
      return (
        <Ellipse
          x={draft.x + draft.width / 2}
          y={draft.y + draft.height / 2}
          radiusX={draft.width / 2}
          radiusY={draft.height / 2}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          opacity={0.7}
          listening={false}
        />
      );
    }
    case "rect":
    case "sticky": {
      const style = DEFAULT_STYLE[draft.kind];
      return (
        <Rect
          {...draft}
          fill={draft.kind === "sticky" ? stickyColor : style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          opacity={0.7}
          listening={false}
        />
      );
    }
  }
});

/** The arrow being drawn, plus highlights on its source and the shape under the pointer. */
function ConnectorDraft({
  draft,
  scale,
}: {
  draft: Extract<Draft, { kind: "connector" }>;
  scale: number;
}) {
  const [from, target] = useSceneStore(
    useShallow((s) => [
      draft.fromId ? s.scene.shapes[draft.fromId] : undefined,
      draft.targetId ? s.scene.shapes[draft.targetId] : undefined,
    ]),
  );
  const fromOutline = from && shapeOutline(from);
  const targetOutline = target && shapeOutline(target);

  let points: number[] | null = null;
  if (fromOutline && targetOutline) {
    points = connectorPoints(fromOutline, targetOutline);
  } else if (fromOutline) {
    const start = anchorPoint(fromOutline, draft.to);
    points = [start.x, start.y, draft.to.x, draft.to.y];
  }
  const { stroke, strokeWidth } = DEFAULT_CONNECTOR_STYLE;
  const head = arrowHeadSize(strokeWidth);

  return (
    <>
      {fromOutline && <OutlineHighlight outline={fromOutline} scale={scale} />}
      {targetOutline && <OutlineHighlight outline={targetOutline} scale={scale} />}
      {points && (
        <Arrow
          points={points}
          stroke={stroke}
          fill={stroke}
          strokeWidth={strokeWidth}
          pointerLength={head}
          pointerWidth={head}
          opacity={0.7}
          listening={false}
        />
      )}
    </>
  );
}

function OutlineHighlight({ outline, scale }: { outline: Outline; scale: number }) {
  const { box, kind } = outline;
  const common = {
    stroke: HIGHLIGHT,
    strokeWidth: 2 / scale,
    fill: "rgba(59, 130, 246, 0.08)",
    listening: false,
  };
  if (kind === "ellipse") {
    const c = outlineCentre(outline);
    return (
      <Ellipse
        {...common}
        x={c.x}
        y={c.y}
        radiusX={box.width / 2}
        radiusY={box.height / 2}
        rotation={outline.rotation}
      />
    );
  }
  return (
    <Rect
      {...common}
      x={outline.x}
      y={outline.y}
      offsetX={-box.x}
      offsetY={-box.y}
      width={box.width}
      height={box.height}
      rotation={outline.rotation}
    />
  );
}
