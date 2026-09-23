import { Group, Rect } from "react-konva";
import type { RectShape as RectShapeData } from "@whiteboard/shared";
import { nodeProps, ShapeLabel, type ShapeProps } from "./common";

export function RectShape({ shape, draggable, editing }: ShapeProps<RectShapeData>) {
  const { style } = shape;
  return (
    <Group {...nodeProps(shape, draggable)}>
      <Rect
        width={shape.width}
        height={shape.height}
        cornerRadius={style.cornerRadius ?? 0}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        perfectDrawEnabled={false}
      />
      <ShapeLabel shape={shape} editing={editing} />
    </Group>
  );
}
