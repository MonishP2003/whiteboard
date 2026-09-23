import { Ellipse, Group } from "react-konva";
import type { EllipseShape as EllipseShapeData } from "@whiteboard/shared";
import { nodeProps, ShapeLabel, type ShapeProps } from "./common";

/**
 * Stored as a bounding box like rects, so resizing works the same; the Konva ellipse is
 * centred inside it.
 */
export function EllipseShape({ shape, draggable, editing }: ShapeProps<EllipseShapeData>) {
  const { style } = shape;
  return (
    <Group {...nodeProps(shape, draggable)}>
      <Ellipse
        x={shape.width / 2}
        y={shape.height / 2}
        radiusX={shape.width / 2}
        radiusY={shape.height / 2}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        perfectDrawEnabled={false}
      />
      <ShapeLabel shape={shape} editing={editing} />
    </Group>
  );
}
