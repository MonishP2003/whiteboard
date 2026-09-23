import { Text } from "react-konva";
import type { Shape } from "@whiteboard/shared";
import { LINE_HEIGHT, renderedFontSize, textBox, textStyle, type TextCapableShape } from "../text";

export interface ShapeProps<S extends Shape> {
  shape: S;
  draggable: boolean;
  /** The text editor is open over this shape, so its Konva text is hidden. */
  editing: boolean;
}

/**
 * Props every shape's outermost node gets. `id` and `name` let the Transformer and hit
 * tests find it; x/y/rotation live on this node so transforms work the same for all types.
 */
export function nodeProps(shape: Shape, draggable: boolean) {
  return {
    id: shape.id,
    name: "shape",
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    opacity: shape.style.opacity,
    draggable,
  };
}

/** Wrapped, auto-shrinking text inside a sticky, rect or ellipse. */
export function ShapeLabel({ shape, editing }: { shape: TextCapableShape; editing: boolean }) {
  const text = shape.text ?? "";
  if (!text && !editing) return null;
  const box = textBox(shape);
  const { fontFamily, fontStyle, align, color } = textStyle(shape);
  return (
    <Text
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      text={text}
      fontSize={renderedFontSize(shape, text)}
      fontFamily={fontFamily}
      fontStyle={fontStyle}
      align={align}
      verticalAlign={box.verticalAlign}
      lineHeight={LINE_HEIGHT}
      wrap="word"
      fill={color}
      visible={!editing}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}
