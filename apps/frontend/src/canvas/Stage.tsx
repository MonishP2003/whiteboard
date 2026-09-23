import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as HtmlDragEvent,
} from "react";
import type Konva from "konva";
import { Layer, Stage } from "react-konva";
import { useUiStore, type Viewport } from "@/store/uiStore";
import { setActiveStage } from "./activeStage";
import { pointerWorld, type Vec2 } from "./coords";
import { DotGrid } from "./DotGrid";
import { ConnectorsRenderer } from "./connectors/ConnectorView";
import { useLiveStore } from "./connectors/liveStore";
import { DraftPreview } from "./DraftPreview";
import { ShapeRenderer } from "./shapes/ShapeRenderer";
import { PRESET_MIME, presetById } from "./presets";
import { toolCursor, tools } from "./tools";
import { addAndSelect, type DragEvent, type PointerEvent } from "./tools/types";
import { SelectionTransformer } from "./transform/SelectionTransformer";
import { TextEditor } from "./transform/TextEditor";
import { useShortcuts } from "./useShortcuts";
import { zoomAround } from "./viewport";

/** Largest wheel delta used per event, so one mouse-wheel notch doesn't jump too far. */
const MAX_ZOOM_DELTA = 20;
const ZOOM_SPEED = 0.01;

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewport = useUiStore((s) => s.viewport);
  const activeTool = useUiStore((s) => s.activeTool);
  const panKeyHeld = useUiStore((s) => s.panKeyHeld);
  const panStart = useRef<{ pointer: Vec2; viewport: Viewport } | null>(null);
  const [panning, setPanning] = useState(false);

  useShortcuts();

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      useUiStore.getState().setCanvasSize(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // For export, which lives outside the canvas tree.
  const hasSize = size.width > 0;
  useEffect(() => {
    if (!hasSize) return;
    setActiveStage(stageRef.current);
    return () => setActiveStage(null);
  }, [hasSize]);

  // Selection, tool and viewport don't carry over to the next board.
  useEffect(() => () => useUiStore.getState().reset(), []);

  // Switching tools mid-gesture (e.g. by shortcut) abandons the old tool's gesture.
  useEffect(() => () => void tools[activeTool].cancel?.(), [activeTool]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const { viewport, setViewport } = useUiStore.getState();
    const unit = e.evt.deltaMode === 1 ? 16 : e.evt.deltaMode === 2 ? size.height : 1;
    const dx = e.evt.deltaX * unit;
    const dy = e.evt.deltaY * unit;

    // Ctrl/⌘+wheel and trackpad pinch (which arrives as wheel + ctrlKey) zoom.
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const delta = Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, dy));
      setViewport(zoomAround(viewport, pointer, viewport.scale * Math.exp(-delta * ZOOM_SPEED)));
      return;
    }
    // Plain wheel pans; shift+wheel pans sideways on mice that only scroll vertically.
    const [px, py] = e.evt.shiftKey && dx === 0 ? [dy, 0] : [dx, dy];
    setViewport({ ...viewport, x: viewport.x - px, y: viewport.y - py });
  };

  const onPointerDown = (e: PointerEvent) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const ui = useUiStore.getState();
    const { button, pointerId } = e.evt;

    // Pan: middle mouse anywhere, or left mouse with the pan tool or space held.
    if (button === 1 || (button === 0 && (ui.activeTool === "pan" || ui.panKeyHeld))) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      // Suppresses the compat mousedown, so Konva doesn't start dragging a shape too.
      e.evt.preventDefault();
      panStart.current = { pointer, viewport: ui.viewport };
      setPanning(true);
      stage.content.setPointerCapture(pointerId);
      return;
    }
    if (button !== 0) return;

    const pos = pointerWorld(stage);
    if (!pos) return;
    // Keep receiving moves/ups when the pointer leaves the canvas or crosses a panel.
    stage.content.setPointerCapture(pointerId);
    tools[ui.activeTool].onPointerDown?.(e, pos);
  };

  const onPointerMove = (e: PointerEvent) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const start = panStart.current;
    if (start) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      useUiStore.getState().setViewport({
        ...start.viewport,
        x: start.viewport.x + pointer.x - start.pointer.x,
        y: start.viewport.y + pointer.y - start.pointer.y,
      });
      return;
    }
    const pos = pointerWorld(stage);
    if (pos) tools[useUiStore.getState().activeTool].onPointerMove?.(e, pos);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (panStart.current) {
      panStart.current = null;
      setPanning(false);
      return;
    }
    const stage = e.target.getStage();
    const pos = stage && pointerWorld(stage);
    if (pos && e.evt.button === 0) tools[useUiStore.getState().activeTool].onPointerUp?.(e, pos);
  };

  const onPointerCancel = () => {
    panStart.current = null;
    setPanning(false);
    tools[useUiStore.getState().activeTool].cancel?.();
  };

  const onDoubleClick = (e: PointerEvent) => {
    const stage = e.target.getStage();
    const pos = stage && pointerWorld(stage);
    if (pos) tools[useUiStore.getState().activeTool].onDoubleClick?.(e, pos);
  };

  // Only the select tool makes shapes draggable. Drag events go to it even if the tool
  // changed mid-drag, so the moved positions still reach the store.
  const onDragStart = (e: DragEvent) => tools.select.onDragStart?.(e);
  const onDragEnd = (e: DragEvent) => tools.select.onDragEnd?.(e);
  // Connectors follow dragged shapes before the drag is committed.
  const onDragMove = (e: DragEvent) => {
    if (e.target.hasName("shape")) useLiveStore.getState().track([e.target]);
  };

  // Presets dragged from the shape drawer land centred under the pointer.
  const onDragOver = (e: HtmlDragEvent) => {
    if (!e.dataTransfer.types.includes(PRESET_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: HtmlDragEvent) => {
    const preset = presetById(e.dataTransfer.getData(PRESET_MIME));
    const stage = stageRef.current;
    if (!preset || !stage) return;
    e.preventDefault();
    stage.setPointersPositions(e.nativeEvent);
    const pos = pointerWorld(stage);
    if (pos) addAndSelect(preset.create(pos));
  };

  const cursor = panning ? "grabbing" : panKeyHeld ? "grab" : toolCursor[activeTool];

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none overflow-hidden"
      style={{ cursor }}
      // Stops middle-click autoscroll.
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerDblClick={onDoubleClick}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        >
          <Layer name="grid-layer" listening={false}>
            <DotGrid />
          </Layer>
          <Layer name="shapes-layer">
            <ShapeRenderer />
          </Layer>
          <Layer name="connectors-layer">
            <ConnectorsRenderer />
          </Layer>
          <Layer name="overlay-layer">
            <DraftPreview />
            <SelectionTransformer />
          </Layer>
        </Stage>
      )}
      <TextEditor stageRef={stageRef} />
    </div>
  );
}
