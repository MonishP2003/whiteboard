import type Konva from "konva";
import { create } from "zustand";
import type { Scene } from "@whiteboard/shared";
import { useSceneStore } from "@/store/sceneStore";

/** A shape node's position while Konva drags or transforms it. */
export interface LiveTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Where dragged/transformed shapes are right now, before the gesture ends and the scene
 * store hears about it. Only connectors read it, so arrows follow shapes mid-drag. Never
 * saved and never in undo history.
 */
interface LiveState {
  live: Record<string, LiveTransform>;
  /** Records the current transform of each node. */
  track: (nodes: Konva.Node[]) => void;
  clear: () => void;
}

const connectedCache = new WeakMap<Scene["connectors"], Set<string>>();

/** IDs of shapes with at least one connector, cached per connectors object. */
function connectedIds(connectors: Scene["connectors"]): Set<string> {
  let ids = connectedCache.get(connectors);
  if (!ids) {
    ids = new Set(Object.values(connectors).flatMap((c) => [c.fromId, c.toId]));
    connectedCache.set(connectors, ids);
  }
  return ids;
}

export const useLiveStore = create<LiveState>()((set) => ({
  live: {},
  track: (nodes) => {
    // Unconnected shapes would only cause re-renders nobody needs.
    const connected = connectedIds(useSceneStore.getState().scene.connectors);
    const relevant = nodes.filter((n) => connected.has(n.id()));
    if (relevant.length === 0) return;
    set((s) => {
      const live = { ...s.live };
      for (const n of relevant) {
        live[n.id()] = {
          x: n.x(),
          y: n.y(),
          rotation: n.rotation(),
          scaleX: n.scaleX(),
          scaleY: n.scaleY(),
        };
      }
      return { live };
    });
  },
  clear: () => set((s) => (Object.keys(s.live).length ? { live: {} } : s)),
}));
