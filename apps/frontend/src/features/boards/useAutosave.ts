import { useEffect, useRef, useState } from "react";
import type { SaveBoardBody } from "@whiteboard/shared";
import { api } from "@/lib/api";
import { useSceneStore } from "@/store/sceneStore";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 2_000;
/** Browsers cap keepalive request bodies at 64 KiB. */
const KEEPALIVE_MAX_BYTES = 60_000;

/**
 * Saves the whole scene 2 s after the last edit. Pending changes are flushed when the
 * component unmounts (leaving the route) and, where possible, when the tab closes.
 * `flush` saves pending changes now, e.g. before logging out.
 */
export function useAutosave(boardId: string): { status: SaveStatus; flush: () => Promise<void> } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const rerun = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const url = `/boards/${boardId}`;

    const clearTimer = () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    };

    const save = async (): Promise<void> => {
      clearTimer();
      if (!dirty.current) return;
      // One request at a time, so an older scene can't overwrite a newer one.
      if (inFlight.current) {
        rerun.current = true;
        return;
      }
      dirty.current = false;
      inFlight.current = true;
      setStatus("saving");
      const body: SaveBoardBody = { scene: useSceneStore.getState().scene };
      try {
        await api(url, { method: "PUT", body: JSON.stringify(body) });
        if (!dirty.current) setStatus("saved");
      } catch {
        // Retried on the next edit or flush.
        dirty.current = true;
        rerun.current = false;
        setStatus("error");
      } finally {
        inFlight.current = false;
        if (rerun.current) {
          rerun.current = false;
          void save();
        }
      }
    };

    saveRef.current = save;

    const unsubscribe = useSceneStore.subscribe((state, prev) => {
      if (state.scene === prev.scene || state.lastChange !== "edit") return;
      dirty.current = true;
      setStatus("pending");
      clearTimer();
      timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
    });

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        const body = JSON.stringify({
          scene: useSceneStore.getState().scene,
        } satisfies SaveBoardBody);
        if (body.length <= KEEPALIVE_MAX_BYTES) {
          // keepalive lets the request outlive the page.
          void fetch(`/api${url}`, {
            method: "PUT",
            keepalive: true,
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body,
          });
          dirty.current = false;
          return;
        }
      }
      // Too large for keepalive, or a save is still running: ask the user to stay.
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      void save();
    };
  }, [boardId]);

  // Stable, so callers can use it in effects and handlers freely.
  const [flush] = useState(() => () => saveRef.current());
  return { status, flush };
}
