import { memo, useMemo } from "react";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { usePreviewStore } from "../previewStore";
import { DiamondShape } from "./DiamondShape";
import { EllipseShape } from "./EllipseShape";
import { FreehandShape } from "./FreehandShape";
import { ImageShape } from "./ImageShape";
import { RectShape } from "./RectShape";
import { StickyShape } from "./StickyShape";
import { TextShape } from "./TextShape";

/** Renders every shape in `scene.order`, which is the z-order (back to front). */
export const ShapeRenderer = memo(function ShapeRenderer() {
  const order = useSceneStore((s) => s.scene.order);
  const draggable = useUiStore((s) => s.activeTool === "select" && !s.panKeyHeld);
  const editingTextId = useUiStore((s) => s.editingTextId);

  return order.map((id) => (
    <ShapeNode
      key={id}
      id={id}
      draggable={draggable && id !== editingTextId}
      editing={id === editingTextId}
    />
  ));
});

/**
 * Subscribes to one shape only, so editing a shape re-renders just that shape (immer keeps
 * the other shape objects referentially equal).
 */
const ShapeNode = memo(function ShapeNode(props: {
  id: string;
  draggable: boolean;
  editing: boolean;
}) {
  const stored = useSceneStore((s) => s.scene.shapes[props.id]);
  const preview = usePreviewStore((s) =>
    s.preview?.ids.includes(props.id) ? s.preview.style : undefined,
  );
  const shape = useMemo(
    () => (stored && preview ? { ...stored, style: { ...stored.style, ...preview } } : stored),
    [stored, preview],
  );
  if (!shape) return null;
  const common = { draggable: props.draggable, editing: props.editing };

  switch (shape.type) {
    case "rect":
      return <RectShape shape={shape} {...common} />;
    case "ellipse":
      return <EllipseShape shape={shape} {...common} />;
    case "diamond":
      return <DiamondShape shape={shape} {...common} />;
    case "text":
      return <TextShape shape={shape} {...common} />;
    case "sticky":
      return <StickyShape shape={shape} {...common} />;
    case "freehand":
      return <FreehandShape shape={shape} {...common} />;
    case "image":
      return <ImageShape shape={shape} {...common} />;
  }
});
