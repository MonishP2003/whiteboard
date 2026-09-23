import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  ChevronDown,
  ChevronUp,
  Copy,
  MoveLeft,
  MoveRight,
  SendToBack,
  Trash2,
  Type,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Connector, Shape, Style } from "@whiteboard/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hasArrowEnd, hasArrowStart } from "@/canvas/connectors/geometry";
import { MIN_SHAPE_SIZE } from "@/canvas/defaults";
import { usePreviewStore } from "@/canvas/previewStore";
import { FONT_FAMILIES, supportsText, textStyle, type TextCapableShape } from "@/canvas/text";
import { useSceneStore, type ConnectorPatch, type ShapePatch } from "@/store/sceneStore";
import { STICKY_COLORS, useUiStore } from "@/store/uiStore";
import { FloatingPanel, IconButton, MOD_KEY } from "@/features/editor/FloatingPanel";
import { ColorPicker, PALETTE } from "./ColorPicker";
import { common, FieldRow, MIXED, NumberField, Section, SliderField } from "./fields";

type ShapeType = Shape["type"];
const FILLED: ShapeType[] = ["rect", "ellipse", "diamond", "sticky", "text"];
const STROKED: ShapeType[] = ["rect", "ellipse", "diamond", "freehand"];
const MAX_FONT_SIZE = 1_000;
const MAX_STROKE_WIDTH = 20;
const MAX_CORNER_RADIUS = 100;

const allOf = (shapes: Shape[], types: ShapeType[]) => shapes.every((s) => types.includes(s.type));

/*
 * Every control commits one store action per user commit (colour pick, slider release,
 * input blur). Sliders show live feedback through the preview store, which the canvas
 * draws over the stored style without touching the scene.
 */
function commitStyle(ids: string[], style: Partial<Style>) {
  usePreviewStore.getState().setPreview(null);
  useSceneStore.getState().updateStyle(ids, style);
}
const previewStyle = (ids: string[], style: Partial<Style>) =>
  usePreviewStore.getState().setPreview({ ids, style });
const cancelPreview = () => usePreviewStore.getState().setPreview(null);

function commitConnectors(ids: string[], patch: ConnectorPatch) {
  usePreviewStore.getState().setPreview(null);
  useSceneStore.getState().updateConnectors(ids, patch);
}

/** Deletes everything selected, connectors included, as one change. */
function deleteSelection() {
  const ui = useUiStore.getState();
  useSceneStore.getState().deleteItems(ui.selectedIds);
  ui.select([]);
}

function commitEach(shapes: Shape[], patch: (shape: Shape) => ShapePatch) {
  useSceneStore.getState().updateShapes(Object.fromEntries(shapes.map((s) => [s.id, patch(s)])));
}

/** Draw.io-style properties for the selection. Only rendered while something is selected. */
export function FormatPanel() {
  const selectedIds = useUiStore((s) => s.selectedIds);
  // Just the selected shapes: immer keeps unchanged shapes referentially equal, so edits
  // elsewhere on the board don't re-render the panel.
  const shapes = useSceneStore(
    useShallow((s) => selectedIds.flatMap((id) => s.scene.shapes[id] ?? [])),
  );
  const connectors = useSceneStore(
    useShallow((s) => selectedIds.flatMap((id) => s.scene.connectors[id] ?? [])),
  );
  if (shapes.length === 0 && connectors.length === 0) return null;

  const texts = shapes.every(supportsText) ? (shapes as TextCapableShape[]) : null;

  return (
    <FloatingPanel
      className="top-[4.5rem] right-3 max-h-[calc(100%-8.5rem)] w-64 overflow-y-auto"
      role="region"
      aria-label="Format"
    >
      {/* A mixed selection is formatted as shapes; its connectors are still deleted. */}
      {shapes.length > 0 ? (
        <>
          <StyleSection shapes={shapes} />
          {texts && <TextSection shapes={texts} />}
          <ArrangeSection shapes={shapes} />
        </>
      ) : (
        <ConnectorSection connectors={connectors} />
      )}
    </FloatingPanel>
  );
}

function StyleSection({ shapes }: { shapes: Shape[] }) {
  const ids = shapes.map((s) => s.id);
  const filled = allOf(shapes, FILLED);
  const stroked = allOf(shapes, STROKED);
  const rects = allOf(shapes, ["rect"]);
  const allText = allOf(shapes, ["text"]);
  const allSticky = allOf(shapes, ["sticky"]);

  return (
    <Section title="Style">
      {filled && (
        <FieldRow label={allText ? "Colour" : "Fill"}>
          <ColorPicker
            label={allText ? "Text colour" : "Fill"}
            value={common(shapes, (s) => s.style.fill)}
            swatches={allSticky ? STICKY_COLORS : PALETTE}
            onChange={(fill) => commitStyle(ids, { fill })}
          />
        </FieldRow>
      )}
      {stroked && (
        <>
          <FieldRow label="Stroke">
            <ColorPicker
              label="Stroke"
              value={common(shapes, (s) => s.style.stroke)}
              onChange={(stroke) => commitStyle(ids, { stroke })}
            />
          </FieldRow>
          <SliderField
            label="Stroke width"
            value={common(shapes, (s) => s.style.strokeWidth)}
            min={0}
            max={MAX_STROKE_WIDTH}
            step={1}
            format={(v) => `${v}px`}
            onPreview={(strokeWidth) => previewStyle(ids, { strokeWidth })}
            onCommit={(strokeWidth) => commitStyle(ids, { strokeWidth })}
            onCancel={cancelPreview}
          />
        </>
      )}
      {rects && (
        <SliderField
          label="Corner radius"
          value={common(shapes, (s) => s.style.cornerRadius ?? 0)}
          min={0}
          max={MAX_CORNER_RADIUS}
          step={1}
          format={(v) => `${v}px`}
          onPreview={(cornerRadius) => previewStyle(ids, { cornerRadius })}
          onCommit={(cornerRadius) => commitStyle(ids, { cornerRadius })}
          onCancel={cancelPreview}
        />
      )}
      <SliderField
        label="Opacity"
        value={common(shapes, (s) => s.style.opacity)}
        min={0.05}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onPreview={(opacity) => previewStyle(ids, { opacity })}
        onCommit={(opacity) => commitStyle(ids, { opacity })}
        onCancel={cancelPreview}
      />
    </Section>
  );
}

function TextSection({ shapes }: { shapes: TextCapableShape[] }) {
  const ids = shapes.map((s) => s.id);
  const fontSize = common(shapes, (s) => textStyle(s).fontSize);
  const fontFamily = common(shapes, (s) => textStyle(s).fontFamily);
  const align = common(shapes, (s) => textStyle(s).align);
  const bold = common(shapes, (s) => textStyle(s).fontStyle === "bold");
  const knownFamily = FONT_FAMILIES.some((f) => f.value === fontFamily);

  return (
    <Section title="Text">
      <div className="flex gap-2">
        <Select
          value={fontFamily !== MIXED && knownFamily ? fontFamily : ""}
          onValueChange={(value) => commitStyle(ids, { fontFamily: value })}
        >
          <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Font">
            <SelectValue placeholder={fontFamily === MIXED ? "Mixed" : "Custom"} />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <NumberField
          label="Size"
          value={fontSize}
          min={1}
          max={MAX_FONT_SIZE}
          className="w-20 [&>span]:w-auto"
          onCommit={(size) => commitStyle(ids, { fontSize: size })}
        />
      </div>
      <div className="flex items-center justify-between">
        <ToggleGroup
          type="single"
          size="sm"
          value={align === MIXED ? "" : align}
          onValueChange={(value) =>
            value && commitStyle(ids, { textAlign: value as NonNullable<Style["textAlign"]> })
          }
          aria-label="Alignment"
        >
          <ToggleGroupItem value="left" aria-label="Align left">
            <AlignLeft />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align centre">
            <AlignCenter />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right">
            <AlignRight />
          </ToggleGroupItem>
        </ToggleGroup>
        <Toggle
          size="sm"
          aria-label="Bold"
          // Mixed counts as "not bold", so pressing it makes them all bold.
          pressed={bold === true}
          onPressedChange={(on) => commitStyle(ids, { fontWeight: on ? "bold" : "normal" })}
        >
          <Bold />
        </Toggle>
      </div>
    </Section>
  );
}

function ArrangeSection({ shapes }: { shapes: Shape[] }) {
  const ids = shapes.map((s) => s.id);
  const sized = shapes.every((s) => s.type !== "freehand");
  const tall = shapes.every((s) => s.type !== "freehand" && s.type !== "text");

  const { reorder, duplicate } = useSceneStore.getState();
  const select = useUiStore((s) => s.select);

  return (
    <Section title="Arrange">
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          label="X"
          value={common(shapes, (s) => s.x)}
          onCommit={(x) => commitEach(shapes, () => ({ x }))}
        />
        <NumberField
          label="Y"
          value={common(shapes, (s) => s.y)}
          onCommit={(y) => commitEach(shapes, () => ({ y }))}
        />
        {sized && (
          <NumberField
            label="W"
            min={MIN_SHAPE_SIZE}
            value={common(shapes, (s) => ("width" in s ? s.width : 0))}
            onCommit={(width) => commitEach(shapes, () => ({ width }))}
          />
        )}
        {tall && (
          <NumberField
            label="H"
            min={MIN_SHAPE_SIZE}
            value={common(shapes, (s) => ("height" in s ? s.height : 0))}
            onCommit={(height) => commitEach(shapes, () => ({ height }))}
          />
        )}
        <NumberField
          label="R"
          value={common(shapes, (s) => s.rotation)}
          onCommit={(r) => commitEach(shapes, () => ({ rotation: ((r % 360) + 360) % 360 }))}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex">
          <IconButton
            label="Bring to front"
            shortcut={`${MOD_KEY}Shift+]`}
            onClick={() => reorder(ids, "front")}
          >
            <BringToFront />
          </IconButton>
          <IconButton
            label="Bring forward"
            shortcut={`${MOD_KEY}]`}
            onClick={() => reorder(ids, "forward")}
          >
            <ChevronUp />
          </IconButton>
          <IconButton
            label="Send backward"
            shortcut={`${MOD_KEY}[`}
            onClick={() => reorder(ids, "backward")}
          >
            <ChevronDown />
          </IconButton>
          <IconButton
            label="Send to back"
            shortcut={`${MOD_KEY}Shift+[`}
            onClick={() => reorder(ids, "back")}
          >
            <SendToBack />
          </IconButton>
        </div>
        <div className="flex">
          <IconButton
            label="Duplicate"
            shortcut={`${MOD_KEY}D`}
            onClick={() => select(duplicate(ids))}
          >
            <Copy />
          </IconButton>
          <IconButton
            label="Delete"
            shortcut="Del"
            className="hover:text-destructive"
            onClick={deleteSelection}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </Section>
  );
}

function ConnectorSection({ connectors }: { connectors: Connector[] }) {
  const ids = connectors.map((c) => c.id);
  const dashed = common(connectors, (c) => c.dashed ?? false);
  const arrowStart = common(connectors, hasArrowStart);
  const arrowEnd = common(connectors, hasArrowEnd);
  const style = (patch: Partial<Style>) => commitConnectors(ids, { style: patch });

  return (
    <Section title="Connector">
      <FieldRow label="Colour">
        <ColorPicker
          label="Connector colour"
          value={common(connectors, (c) => c.style.stroke)}
          onChange={(stroke) => style({ stroke })}
        />
      </FieldRow>
      <SliderField
        label="Width"
        value={common(connectors, (c) => c.style.strokeWidth)}
        min={1}
        max={MAX_STROKE_WIDTH}
        step={1}
        format={(v) => `${v}px`}
        onPreview={(strokeWidth) => previewStyle(ids, { strokeWidth })}
        onCommit={(strokeWidth) => style({ strokeWidth })}
        onCancel={cancelPreview}
      />
      <SliderField
        label="Opacity"
        value={common(connectors, (c) => c.style.opacity)}
        min={0.05}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onPreview={(opacity) => previewStyle(ids, { opacity })}
        onCommit={(opacity) => style({ opacity })}
        onCancel={cancelPreview}
      />
      <div className="flex items-center justify-between">
        <ToggleGroup
          type="single"
          size="sm"
          value={dashed === MIXED ? "" : dashed ? "dashed" : "solid"}
          onValueChange={(value) => value && commitConnectors(ids, { dashed: value === "dashed" })}
          aria-label="Line style"
        >
          <ToggleGroupItem value="solid" aria-label="Solid line" className="px-2 text-xs">
            Solid
          </ToggleGroupItem>
          <ToggleGroupItem value="dashed" aria-label="Dashed line" className="px-2 text-xs">
            Dashed
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex">
          <Toggle
            size="sm"
            aria-label="Arrow at start"
            pressed={arrowStart === true}
            onPressedChange={(on) => commitConnectors(ids, { arrowStart: on })}
          >
            <MoveLeft />
          </Toggle>
          <Toggle
            size="sm"
            aria-label="Arrow at end"
            pressed={arrowEnd === true}
            onPressedChange={(on) => commitConnectors(ids, { arrowEnd: on })}
          >
            <MoveRight />
          </Toggle>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <IconButton
          label="Edit label"
          disabled={connectors.length !== 1}
          onClick={() => useUiStore.getState().setEditingTextId(ids[0]!)}
        >
          <Type />
        </IconButton>
        <IconButton
          label="Delete"
          shortcut="Del"
          className="hover:text-destructive"
          onClick={deleteSelection}
        >
          <Trash2 />
        </IconButton>
      </div>
    </Section>
  );
}
