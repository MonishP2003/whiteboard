import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import {
  emptyScene,
  type BoardDetail,
  type BoardSummary,
  type CreateBoardBody,
  type SaveBoardBody,
} from "@whiteboard/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/relativeTime";
import { useAuthStore } from "@/store/authStore";

export function BoardListPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<BoardSummary | null>(null);

  useEffect(() => {
    api<BoardSummary[]>("/boards")
      .then(setBoards)
      .catch(() => setError("Couldn't load your boards."));
  }, []);

  async function createBoard() {
    setCreating(true);
    try {
      const body: CreateBoardBody = { scene: emptyScene() };
      const board = await api<BoardDetail>("/boards", {
        method: "POST",
        body: JSON.stringify(body),
      });
      navigate(`/boards/${board.id}`);
    } catch {
      setError("Couldn't create a board.");
      setCreating(false);
    }
  }

  async function rename(id: string, title: string) {
    const body: SaveBoardBody = { title };
    const updated = await api<BoardSummary>(`/boards/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setBoards((list) => sortByUpdated(list?.map((b) => (b.id === id ? updated : b)) ?? []));
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { id } = toDelete;
    setToDelete(null);
    try {
      await api(`/boards/${id}`, { method: "DELETE" });
      setBoards((list) => list?.filter((b) => b.id !== id) ?? null);
    } catch {
      setError("Couldn't delete the board.");
    }
  }

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="h-full overflow-auto bg-muted">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <h1 className="text-lg font-semibold">Your boards</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut /> Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
          <Button onClick={createBoard} disabled={creating}>
            <Plus /> New board
          </Button>
        </div>

        {boards === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {boards?.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No boards yet. Create one to get started.
          </p>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards?.map((board) => (
            <li key={board.id}>
              <BoardCard board={board} onRename={rename} onDelete={() => setToDelete(board)} />
            </li>
          ))}
        </ul>
      </main>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BoardCard({
  board,
  onRename,
  onDelete,
}: {
  board: BoardSummary;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(board.title);
  const [failed, setFailed] = useState(false);
  // Enter submits and then blurs; only the first one should save.
  const submitting = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const next = title.trim();
    if (!next || next === board.title) {
      setTitle(board.title);
      setEditing(false);
      return;
    }
    submitting.current = true;
    try {
      await onRename(board.id, next);
      setFailed(false);
      setEditing(false);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Card className="group relative transition-shadow hover:shadow-md">
      <CardHeader className="gap-1">
        {editing ? (
          <form onSubmit={submit}>
            <Input
              value={title}
              maxLength={120}
              autoFocus
              aria-invalid={failed}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setTitle(board.title);
                  setEditing(false);
                }
              }}
            />
          </form>
        ) : (
          <CardTitle className="truncate pr-16 text-base">
            <Link to={`/boards/${board.id}`} className="after:absolute after:inset-0">
              {board.title}
            </Link>
          </CardTitle>
        )}
        <CardDescription>Updated {relativeTime(board.updatedAt)}</CardDescription>
      </CardHeader>
      {!editing && (
        <div className="absolute top-3 right-3 z-10 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rename board"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete board" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      )}
    </Card>
  );
}

const sortByUpdated = (list: BoardSummary[]) =>
  [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
