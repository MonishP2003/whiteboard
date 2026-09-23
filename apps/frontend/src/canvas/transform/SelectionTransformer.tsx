import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Transformer } from "react-konva";
import { useShallow } from "zustand/react/shallow";
import type { ShapePatch } from "@/store/sceneStore";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { useLiveStore } from "../connectors/liveStore";
import { MIN_SHAPE_SIZE } from "../defaults";
import { bakeTransform } from "./bake";

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const SIDES_X = ["middle-left", "middle-right"];
const ALL_ANCHORS = [...CORNERS, ...SIDES_X, "top-center", "bottom-center"];
const ROTATION_SNAPS = Array.from({ length: 24 }, (_, i) => i * 15);

function useShiftKey(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setHeld(e.shiftKey);
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  return held;
}

/** Konva Transformer bound to `uiStore.selectedIds`. Lives in the overlay layer. */
export const SelectionTransformer = memo(function SelectionTransformer() {
  const ref = useRef<Konva.Transformer>(null);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const editing = useUiStore((s) => s.editingTextId !== null);
  const shapes = useSceneStore(
    useShallow((s) => selectedIds.flatMap((id) => s.scene.shapes[id] ?? [])),
  );
  const shiftHeld = useShiftKey();

  // Runs after react-konva has created/updated the shape nodes in the same commit. Re-runs
  // when a selected shape changes, since a Group's box changes without the Transformer
  // hearing about it.
  useLayoutEffect(() => {
    const tr = ref.current;
    const stage = tr?.getStage();
    if (!tr || !stage) return;
    tr.nodes(shapes.flatMap((s) => stage.findOne("#" + s.id) ?? []));
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [shapes]);

  const types = new Set(shapes.map((s) => s.type));
  const hasSticky = types.has("sticky");
  const hasText = types.has("text");
  // Non-uniform scaling of a rotated node inside an unrotated box would skew it.
  const rotatedGroup = shapes.length > 1 && shapes.some((s) => s.rotation % 90 !== 0);

  const onTransformEnd = () => {
    const tr = ref.current;
    if (!tr) return;
    // Fired once on the Transformer (then once per node, which we don't listen to), so
    // the whole selection commits as one store change.
    const all = useSceneStore.getState().scene.shapes;
    const patches: Record<string, ShapePatch> = {};
    for (const node of tr.nodes()) {
      const shape = all[node.id()];
      if (shape) patches[shape.id] = bakeTransform(node, shape);
    }
    useSceneStore.getState().updateShapes(patches);
    useLiveStore.getState().clear();
  };

  // Connectors follow resizes and rotations before they're committed.
  const onTransform = () => {
    const tr = ref.current;
    if (tr) useLiveStore.getState().track(tr.nodes());
  };

  return (
    <Transformer
      ref={ref}
      visible={!editing && shapes.length > 0}
      ignoreStroke
      flipEnabled={false}
      keepRatio={hasSticky || hasText || rotatedGroup}
      enabledAnchors={hasSticky ? CORNERS : hasText ? [...CORNERS, ...SIDES_X] : ALL_ANCHORS}
      rotationSnaps={shiftHeld ? ROTATION_SNAPS : []}
      rotationSnapTolerance={7.5}
      rotateAnchorOffset={24}
      anchorSize={9}
      anchorCornerRadius={2}
      anchorStroke="#3b82f6"
      borderStroke="#3b82f6"
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_SHAPE_SIZE || newBox.height < MIN_SHAPE_SIZE ? oldBox : newBox
      }
      onTransform={onTransform}
      onTransformEnd={onTransformEnd}
    />
  );
});
