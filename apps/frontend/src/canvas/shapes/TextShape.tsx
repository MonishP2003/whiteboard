import { Text } from "react-konva";
import type { TextShape as TextShapeData } from "@whiteboard/shared";
import { LINE_HEIGHT, textStyle } from "../text";
import { nodeProps, type ShapeProps } from "./common";

export function TextShape({ shape, draggable, editing }: ShapeProps<TextShapeData>) {
  const { fontSize, fontFamily, fontStyle, align, color } = textStyle(shape);
  return (
    <Text
      {...nodeProps(shape, draggable)}
      width={shape.width}
      text={shape.text}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontStyle={fontStyle}
      align={align}
      lineHeight={LINE_HEIGHT}
      wrap="word"
      fill={color}
      visible={!editing}
      perfectDrawEnabled={false}
    />
  );
}
