import { useEffect, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CanvasStage } from "@/canvas/Stage";
import { AiPromptBar } from "@/features/ai-prompt/AiPromptBar";
import type { SaveStatus } from "@/features/boards/useAutosave";
import { FormatPanel } from "@/features/format-panel/FormatPanel";
import { ShapeDrawer } from "@/features/shape-drawer/ShapeDrawer";
import { Toolbar } from "@/features/toolbar/Toolbar";
import { TopBar } from "@/features/toolbar/TopBar";
import { ZoomControls } from "@/features/toolbar/ZoomControls";

interface EditorLayoutProps {
  boardId: string;
  title: string;
  onTitleChange: (title: string) => void;
  saveStatus: SaveStatus;
  flush: () => Promise<void>;
}

/**
 * The full-bleed canvas with every panel floating over it:
 *
 *   top-left: title/status        top-right: history, export, account
 *   left: toolbar (+ shape drawer)          right: format panel (on selection)
 *   bottom-centre: AI prompt bar            bottom-right: zoom
 */
export function EditorLayout({
  boardId,
  title,
  onTitleChange,
  saveStatus,
  flush,
}: EditorLayoutProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Ctrl/⌘+wheel over a panel would zoom the whole page. Over the canvas, Konva already
  // turns it into a canvas zoom (and prevents the default).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-neutral-50">
        <CanvasStage />
        <TopBar
          boardId={boardId}
          title={title}
          onTitleChange={onTitleChange}
          saveStatus={saveStatus}
          flush={flush}
        />
        <Toolbar />
        <ShapeDrawer />
        <FormatPanel />
        <AiPromptBar />
        <ZoomControls />
      </div>
    </TooltipProvider>
  );
}
