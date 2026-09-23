import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Download, LogOut, Redo2, Undo2 } from "lucide-react";
import type { SaveBoardBody } from "@whiteboard/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { exportPng, exportSvg } from "@/lib/export";
import { redo, undo, useCanRedo, useCanUndo } from "@/store/history";
import { useSceneStore } from "@/store/sceneStore";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { FloatingPanel, IconButton, MOD_KEY } from "@/features/editor/FloatingPanel";
import type { SaveStatus } from "@/features/boards/useAutosave";

const TITLE_MAX = 120;

interface TopBarProps {
  boardId: string;
  title: string;
  onTitleChange: (title: string) => void;
  saveStatus: SaveStatus;
  /** Saves pending scene changes; awaited before logging out. */
  flush: () => Promise<void>;
}

/** Board title and status on the left; history, export and account on the right. */
export function TopBar({ boardId, title, onTitleChange, saveStatus, flush }: TopBarProps) {
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  return (
    <>
      <FloatingPanel className="top-3 left-3 flex h-12 max-w-[calc(50%-1.5rem)] items-center gap-1 px-1.5">
        <IconButton label="Back to boards" asChild>
          <Link to="/boards">
            <ArrowLeft />
          </Link>
        </IconButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <BoardTitle boardId={boardId} title={title} onChange={onTitleChange} />
        <SaveIndicator status={saveStatus} />
      </FloatingPanel>

      <FloatingPanel className="top-3 right-3 flex h-12 items-center gap-1 px-1.5">
        <IconButton label="Undo" shortcut={`${MOD_KEY}Z`} disabled={!canUndo} onClick={undo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" shortcut={`${MOD_KEY}Shift+Z`} disabled={!canRedo} onClick={redo}>
          <Redo2 />
        </IconButton>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ExportMenu title={title} />
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <AccountMenu flush={flush} />
      </FloatingPanel>
    </>
  );
}

/** Click to rename. Saves with a title-only PUT, so the scene isn't sent again. */
function BoardTitle({
  boardId,
  title,
  onChange,
}: {
  boardId: string;
  title: string;
  onChange: (title: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Enter commits and then blurs; only the first should save.
  const done = useRef(false);

  const commit = async () => {
    if (done.current || draft === null) return;
    done.current = true;
    const next = draft.trim();
    setDraft(null);
    if (!next || next === title) return;
    const previous = title;
    onChange(next);
    try {
      const body: SaveBoardBody = { title: next };
      await api(`/boards/${boardId}`, { method: "PUT", body: JSON.stringify(body) });
      setFailed(false);
    } catch {
      onChange(previous);
      setFailed(true);
    }
  };

  if (draft !== null) {
    return (
      <input
        value={draft}
        maxLength={TITLE_MAX}
        autoFocus
        aria-label="Board title"
        className="h-8 w-56 rounded-md border border-input bg-transparent px-2 text-sm font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            done.current = true;
            setDraft(null);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      title={failed ? "Couldn't rename the board" : "Rename board"}
      className={cn(
        "h-8 max-w-64 truncate rounded-md px-2 text-sm font-medium hover:bg-accent",
        failed && "text-destructive",
      )}
      onClick={() => {
        done.current = false;
        setDraft(title);
      }}
    >
      {title}
    </button>
  );
}

const saveLabels: Record<SaveStatus, string> = {
  idle: "",
  pending: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span
      role="status"
      className={cn(
        "shrink-0 px-1 text-xs whitespace-nowrap text-muted-foreground",
        status === "error" && "text-destructive",
      )}
    >
      {saveLabels[status]}
    </span>
  );
}

/** PNG or SVG of the whole board, or of the selection when there is one. */
function ExportMenu({ title }: { title: string }) {
  const empty = useSceneStore((s) => s.scene.order.length === 0);
  const hasSelection = useUiStore((s) => s.selectedIds.length > 0);
  const selection = () => useUiStore.getState().selectedIds;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={empty}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          title={empty ? "Nothing to export yet" : "Export"}
        >
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Board</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => exportPng(title)}>PNG image</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportSvg(title)}>SVG vector</DropdownMenuItem>
        {hasSelection && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Selection
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => exportPng(title, selection())}>
              PNG image
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportSvg(title, selection())}>
              SVG vector
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({ flush }: { flush: () => Promise<void> }) {
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const isPro =
    subscription?.status === "ACTIVE" && new Date(subscription.expiresAt).getTime() > Date.now();
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  const onLogout = async () => {
    // The session cookie goes away with logout, so save first.
    await flush().catch(() => {});
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-start justify-between gap-2 font-normal">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user?.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              isPro ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground",
            )}
          >
            {isPro ? "Pro" : "Free"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
