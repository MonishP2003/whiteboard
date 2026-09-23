import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type Konva from "konva";
import { useShallow } from "zustand/react/shallow";
import { endHistoryBatch, useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { connectorPoints, shapeOutline } from "../connectors/geometry";
import {
  CONNECTOR_LABEL,
  DEFAULT_FONT_FAMILY,
  fitFontSize,
  LINE_HEIGHT,
  measureLabel,
  supportsText,
  textBox,
  textStyle,
  type TextCapableShape,
} from "../text";

/** Where the editor sits on screen, relative to the Stage container. */
interface Placement {
  left: number;
  top: number;
  rotation: number;
  scale: number;
}

/**
 * A <textarea> over the shape (or connector label) being edited, whose Konva text is hidden
 * meanwhile. Must be rendered in the same positioned element as the Stage container, which
 * sits at its (0, 0), so the node's absolute position needs no container offset.
 */
export function TextEditor({ stageRef }: { stageRef: RefObject<Konva.Stage | null> }) {
  const id = useUiStore((s) => s.editingTextId);
  const shape = useSceneStore((s) => (id ? s.scene.shapes[id] : undefined));
  const isConnector = useSceneStore((s) => (id ? id in s.scene.connectors : false));

  // However editing ends, a new text shape and its typing become one undo step.
  useEffect(() => {
    if (!id) endHistoryBatch();
  }, [id]);

  if (id && isConnector) return <LabelEditor key={id} id={id} />;
  if (!shape || !supportsText(shape)) return null;
  // Keyed so each edit session starts with fresh state.
  return <EditorBox key={shape.id} shape={shape} stageRef={stageRef} />;
}

function EditorBox({
  shape,
  stageRef,
}: {
  shape: TextCapableShape;
  stageRef: RefObject<Konva.Stage | null>;
}) {
  const [value, setValue] = useState(shape.text ?? "");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const viewport = useUiStore((s) => s.viewport);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  const box = textBox(shape);
  const style = textStyle(shape);
  const fontSize =
    box.height === undefined
      ? style.fontSize
      : fitFontSize(
          value,
          box.width,
          box.height,
          style.fontSize,
          style.fontFamily,
          style.fontStyle,
        );

  // After commit, so the Konva node already reflects the current viewport and shape.
  useLayoutEffect(() => {
    const node = stageRef.current?.findOne("#" + shape.id);
    if (!node) return;
    const origin = node.getAbsoluteTransform().point({ x: box.x, y: box.y });
    setPlacement({
      left: origin.x,
      top: origin.y,
      rotation: node.getAbsoluteRotation(),
      scale: node.getAbsoluteScale().x,
    });
  }, [stageRef, shape, viewport, box.x, box.y]);

  // Grow the textarea with its content.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value, fontSize, placement]);

  // Deferred a frame so the click that opened the editor has finished.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const ui = useUiStore.getState();
    const scene = useSceneStore.getState();
    ui.setEditingTextId(null);

    const current = scene.scene.shapes[shape.id];
    if (!current || !supportsText(current)) return;
    const text = save ? value : (current.text ?? "");
    if (current.type === "text" && text.trim() === "") {
      scene.deleteItems([current.id]);
      ui.select(ui.selectedIds.filter((x) => x !== current.id));
    } else if (text !== (current.text ?? "")) {
      scene.updateShape(current.id, { text });
    }
    // Now rather than in the effect, so an undo right after sees the finished step.
    endHistoryBatch();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finish(true);
    }
  };

  if (!placement) return null;
  const { left, top, rotation, scale } = placement;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: box.width * scale,
        height: box.height === undefined ? undefined : box.height * scale,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "top left",
        display: "flex",
        alignItems: box.verticalAlign === "middle" ? "center" : "flex-start",
        opacity: shape.style.opacity,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        rows={1}
        spellCheck={false}
        aria-label="Edit text"
        style={{
          display: "block",
          width: "100%",
          maxHeight: box.height === undefined ? undefined : box.height * scale,
          margin: 0,
          padding: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          resize: "none",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          fontSize: fontSize * scale,
          fontFamily: style.fontFamily,
          fontWeight: style.fontStyle,
          lineHeight: LINE_HEIGHT,
          textAlign: style.align,
          color: style.color,
        }}
      />
    </div>
  );
}

/** Edits a connector's label in place, centred on the connector's midpoint. */
function LabelEditor({ id }: { id: string }) {
  const [connector, from, to] = useSceneStore(
    useShallow((s) => {
      const c = s.scene.connectors[id];
      return [c, c && s.scene.shapes[c.fromId], c && s.scene.shapes[c.toId]] as const;
    }),
  );
  const viewport = useUiStore((s) => s.viewport);
  const [value, setValue] = useState(connector?.label ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!connector || !from || !to) return null;

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    useUiStore.getState().setEditingTextId(null);
    if (save && value.trim() !== (connector.label ?? "")) {
      useSceneStore.getState().setConnectorLabel(id, value);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Labels are short; Shift+Enter still adds a line.
      e.preventDefault();
      finish(true);
    }
  };

  const [x1, y1, x2, y2] = connectorPoints(shapeOutline(from), shapeOutline(to));
  const { scale } = viewport;
  const size = measureLabel(value);
  const pad = CONNECTOR_LABEL.padding;

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      aria-label="Edit connector label"
      style={{
        position: "absolute",
        left: ((x1 + x2) / 2) * scale + viewport.x,
        top: ((y1 + y2) / 2) * scale + viewport.y,
        transform: "translate(-50%, -50%)",
        boxSizing: "content-box",
        width: Math.max(size.width, CONNECTOR_LABEL.fontSize * 2) * scale,
        height: size.height * scale,
        margin: 0,
        padding: pad * scale,
        border: "1px solid #3b82f6",
        borderRadius: 3,
        outline: "none",
        background: "#ffffff",
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre",
        fontSize: CONNECTOR_LABEL.fontSize * scale,
        fontFamily: DEFAULT_FONT_FAMILY,
        lineHeight: LINE_HEIGHT,
        textAlign: "center",
        color: CONNECTOR_LABEL.color,
        opacity: connector.style.opacity,
      }}
    />
  );
}
