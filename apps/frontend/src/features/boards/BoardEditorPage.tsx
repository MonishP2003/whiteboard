import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { BoardDetail } from "@whiteboard/shared";
import { FullPageMessage, NotFoundPage } from "@/components/FullPage";
import { api, ApiError } from "@/lib/api";
import { useSceneStore } from "@/store/sceneStore";
import { EditorLayout } from "@/features/editor/EditorLayout";
import { useAutosave } from "./useAutosave";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; title: string }
  | { kind: "not-found" }
  | { kind: "error" };

export function BoardEditorPage() {
  const { id = "" } = useParams();
  const loadScene = useSceneStore((s) => s.loadScene);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    api<BoardDetail>(`/boards/${id}`)
      .then((board) => {
        if (cancelled) return;
        loadScene(board.scene);
        setState({ kind: "ready", title: board.title });
      })
      .catch((err) => {
        if (cancelled) return;
        // 400 = malformed ID; the API also returns 404 for other users' boards.
        const missing = err instanceof ApiError && (err.status === 404 || err.status === 400);
        setState({ kind: missing ? "not-found" : "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [id, loadScene]);

  switch (state.kind) {
    case "loading":
      return <FullPageMessage>Loading board…</FullPageMessage>;
    case "not-found":
      return <NotFoundPage message="Board not found." />;
    case "error":
      return <FullPageMessage>Couldn't load this board.</FullPageMessage>;
    case "ready":
      // Keyed so autosave never carries pending state from one board to another.
      return <Editor key={id} boardId={id} title={state.title} />;
  }
}

function Editor({ boardId, title: initialTitle }: { boardId: string; title: string }) {
  const { status, flush } = useAutosave(boardId);
  const [title, setTitle] = useState(initialTitle);

  return (
    <EditorLayout
      boardId={boardId}
      title={title}
      onTitleChange={setTitle}
      saveStatus={status}
      flush={flush}
    />
  );
}
