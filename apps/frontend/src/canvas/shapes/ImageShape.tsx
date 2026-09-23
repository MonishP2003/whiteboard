import { useEffect, useState } from "react";
import { Group, Image, Rect } from "react-konva";
import type { ImageShape as ImageShapeData } from "@whiteboard/shared";
import { nodeProps, type ShapeProps } from "./common";

/** Minimal image rendering; Stage 7 (AI charts) builds on this. */
export function ImageShape({ shape, draggable }: ShapeProps<ImageShapeData>) {
  const [image, setImage] = useState<HTMLImageElement>();

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = shape.src;
    return () => {
      img.onload = null;
    };
  }, [shape.src]);

  return (
    <Group {...nodeProps(shape, draggable)}>
      {image ? (
        <Image image={image} width={shape.width} height={shape.height} />
      ) : (
        <Rect width={shape.width} height={shape.height} fill="#e5e7eb" />
      )}
    </Group>
  );
}
