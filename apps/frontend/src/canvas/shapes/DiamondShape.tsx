import { Group, Line } from "react-konva";
import type { DiamondShape as DiamondShapeData } from "@whiteboard/shared";
import { nodeProps, ShapeLabel, type ShapeProps } from "./common";

/** Stored as a bounding box like rects; the rhombus touches the midpoint of each side. */
export function DiamondShape({ shape, draggable, editing }: ShapeProps<DiamondShapeData>) {
  const { style, width: w, height: h } = shape;
  return (
    <Group {...nodeProps(shape, draggable)}>
      <Line
        points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]}
        closed
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        lineJoin="round"
        perfectDrawEnabled={false}
      />
      <ShapeLabel shape={shape} editing={editing} />
    </Group>
  );
}
