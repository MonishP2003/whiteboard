import { Line } from "react-konva";
import type { FreehandShape as FreehandShapeData } from "@whiteboard/shared";
import { FREEHAND_TENSION } from "../defaults";
import { nodeProps, type ShapeProps } from "./common";

export function FreehandShape({ shape, draggable }: ShapeProps<FreehandShapeData>) {
  const { style } = shape;
  return (
    <Line
      {...nodeProps(shape, draggable)}
      points={shape.points}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      tension={FREEHAND_TENSION}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(style.strokeWidth, 12)}
      perfectDrawEnabled={false}
    />
  );
}
