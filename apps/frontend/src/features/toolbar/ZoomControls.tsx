import { Maximize, Minus, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fitToContent, resetZoom, zoomIn, zoomOut } from "@/canvas/viewport";
import { useUiStore } from "@/store/uiStore";
import { FloatingPanel, IconButton, MOD_KEY, TooltipLabel } from "@/features/editor/FloatingPanel";

export function ZoomControls() {
  const scale = useUiStore((s) => s.viewport.scale);

  return (
    <FloatingPanel className="right-3 bottom-3 flex h-10 items-center gap-0.5 px-1">
      <IconButton label="Zoom out" shortcut={`${MOD_KEY}−`} side="top" onClick={zoomOut}>
        <Minus />
      </IconButton>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="h-8 w-12 rounded-md text-xs tabular-nums hover:bg-accent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={resetZoom}
          >
            {Math.round(scale * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <TooltipLabel label="Reset to 100%" shortcut="Shift+0" />
        </TooltipContent>
      </Tooltip>
      <IconButton label="Zoom in" shortcut={`${MOD_KEY}+`} side="top" onClick={zoomIn}>
        <Plus />
      </IconButton>
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <IconButton label="Fit to content" shortcut="Shift+1" side="top" onClick={fitToContent}>
        <Maximize />
      </IconButton>
    </FloatingPanel>
  );
}
