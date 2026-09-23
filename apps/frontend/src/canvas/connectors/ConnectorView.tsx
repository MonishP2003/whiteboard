import { memo, useMemo } from "react";
import { Arrow, Group, Line, Rect, Text } from "react-konva";
import { useShallow } from "zustand/react/shallow";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { usePreviewStore } from "../previewStore";
import { CONNECTOR_LABEL, DEFAULT_FONT_FAMILY, LINE_HEIGHT, measureLabel } from "../text";
import {
  arrowHeadSize,
  connectorDash,
  connectorPoints,
  hasArrowEnd,
  hasArrowStart,
  shapeOutline,
} from "./geometry";
import { useLiveStore } from "./liveStore";

/** Extra width of the highlight behind a selected connector, in world units. */
const SELECTED_HALO = 8;
/** Minimum clickable width of a connector, in world units. */
const MIN_HIT_WIDTH = 14;

/** Every connector, drawn in the connectors layer above the shapes. */
export const ConnectorsRenderer = memo(function ConnectorsRenderer() {
  const ids = useSceneStore(useShallow((s) => Object.keys(s.scene.connectors)));
  const selectedIds = useUiStore((s) => s.selectedIds);
  const editingTextId = useUiStore((s) => s.editingTextId);
  const selected = new Set(selectedIds);

  return ids.map((id) => (
    <ConnectorView key={id} id={id} selected={selected.has(id)} editing={id === editingTextId} />
  ));
});

/**
 * Subscribes to its connector, both end shapes and their live drag positions, so only
 * arrows touching a moving shape redraw.
 */
const ConnectorView = memo(function ConnectorView(props: {
  id: string;
  selected: boolean;
  editing: boolean;
}) {
  const [stored, from, to] = useSceneStore(
    useShallow((s) => {
      const c = s.scene.connectors[props.id];
      return [c, c && s.scene.shapes[c.fromId], c && s.scene.shapes[c.toId]] as const;
    }),
  );
  const liveFrom = useLiveStore((s) => (stored ? s.live[stored.fromId] : undefined));
  const liveTo = useLiveStore((s) => (stored ? s.live[stored.toId] : undefined));
  const preview = usePreviewStore((s) =>
    s.preview?.ids.includes(props.id) ? s.preview.style : undefined,
  );

  const connector = useMemo(
    () => (stored && preview ? { ...stored, style: { ...stored.style, ...preview } } : stored),
    [stored, preview],
  );
  const points = useMemo(
    () =>
      from && to
        ? connectorPoints(
            shapeOutline(from, { live: liveFrom }),
            shapeOutline(to, { live: liveTo }),
          )
        : null,
    [from, to, liveFrom, liveTo],
  );
  if (!connector || !points) return null;

  const { style } = connector;
  const head = arrowHeadSize(style.strokeWidth);
  const label = connector.label;

  return (
    <Group id={connector.id} name="connector" opacity={style.opacity}>
      {props.selected && (
        <Line
          name="selection-ui"
          points={points}
          stroke="#3b82f6"
          strokeWidth={style.strokeWidth + SELECTED_HALO}
          opacity={0.35}
          lineCap="round"
          listening={false}
        />
      )}
      <Arrow
        points={points}
        stroke={style.stroke}
        fill={style.stroke}
        strokeWidth={style.strokeWidth}
        pointerLength={head}
        pointerWidth={head}
        pointerAtBeginning={hasArrowStart(connector)}
        pointerAtEnding={hasArrowEnd(connector)}
        dash={connectorDash(connector)}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={Math.max(style.strokeWidth, MIN_HIT_WIDTH)}
        perfectDrawEnabled={false}
      />
      {label && !props.editing && (
        <ConnectorLabel
          text={label}
          x={(points[0] + points[2]) / 2}
          y={(points[1] + points[3]) / 2}
        />
      )}
    </Group>
  );
});

/** The label on a white tag, centred on (x, y). Clicking it selects the connector. */
function ConnectorLabel({ text, x, y }: { text: string; x: number; y: number }) {
  const size = useMemo(() => measureLabel(text), [text]);
  const pad = CONNECTOR_LABEL.padding;
  const width = size.width + pad * 2;
  const height = size.height + pad * 2;
  return (
    <Group x={x - width / 2} y={y - height / 2}>
      <Rect width={width} height={height} fill="#ffffff" cornerRadius={3} />
      <Text
        x={pad}
        y={pad}
        width={size.width}
        text={text}
        fontSize={CONNECTOR_LABEL.fontSize}
        fontFamily={DEFAULT_FONT_FAMILY}
        lineHeight={LINE_HEIGHT}
        align="center"
        wrap="none"
        fill={CONNECTOR_LABEL.color}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}
