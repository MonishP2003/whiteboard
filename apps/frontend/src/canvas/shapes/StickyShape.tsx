import { Group, Rect } from "react-konva";
import type { StickyShape as StickyShapeData } from "@whiteboard/shared";
import { nodeProps, ShapeLabel, type ShapeProps } from "./common";

export function StickyShape({ shape, draggable, editing }: ShapeProps<StickyShapeData>) {
  return (
    <Group {...nodeProps(shape, draggable)}>
      <Rect
        width={shape.width}
        height={shape.height}
        fill={shape.style.fill}
        cornerRadius={2}
        shadowColor="#000"
        shadowOpacity={0.18}
        shadowBlur={8}
        shadowOffsetY={3}
        shadowForStrokeEnabled={false}
        perfectDrawEnabled={false}
      />
      <ShapeLabel shape={shape} editing={editing} />
    </Group>
  );
}
