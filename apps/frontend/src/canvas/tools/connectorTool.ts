import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { shapeAt } from "../connectors/geometry";
import type { Vec2 } from "../coords";
import { useDraftStore } from "../draftStore";
import type { ToolHandler } from "./types";

/**
 * Press on a shape, drag to another and release to connect them. The shape under the
 * pointer is highlighted, before and during the drag. Releasing anywhere else cancels.
 * The tool stays active, so several connections can be drawn in a row.
 */
export function createConnectorTool(): ToolHandler {
  let fromId: string | null = null;

  const hit = (pos: Vec2, exclude?: string) =>
    shapeAt(useSceneStore.getState().scene, pos, { exclude });

  const show = (to: Vec2, targetId: string | null) => {
    const { draft, setDraft } = useDraftStore.getState();
    // While just hovering, only redraw when the highlighted shape changes.
    if (!fromId && draft?.kind === "connector" && draft.targetId === targetId) return;
    setDraft({ kind: "connector", fromId, to, targetId });
  };

  const stop = () => {
    fromId = null;
    useDraftStore.getState().setDraft(null);
  };

  return {
    onPointerDown(_e, pos) {
      fromId = hit(pos);
      if (!fromId) {
        useUiStore.getState().select([]);
        return;
      }
      show(pos, null);
    },
    onPointerMove(_e, pos) {
      show(pos, hit(pos, fromId ?? undefined));
    },
    onPointerUp(_e, pos) {
      const from = fromId;
      stop();
      if (!from) return;
      const toId = hit(pos, from);
      if (!toId) return;
      const id = useSceneStore.getState().addConnector(from, toId);
      useUiStore.getState().select([id]);
    },
    cancel() {
      const active = fromId !== null;
      stop();
      return active;
    },
  };
}
