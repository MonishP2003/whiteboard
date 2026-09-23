import type { ComponentType, ReactNode } from "react";
import {
  Circle,
  Hand,
  MousePointer2,
  MoveUpRight,
  Pen,
  Shapes,
  Square,
  StickyNote,
  Type,
  type LucideProps,
} from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TOOL_KEYS } from "@/canvas/useShortcuts";
import { cn } from "@/lib/utils";
import { STICKY_COLORS, useUiStore, type Tool } from "@/store/uiStore";
import { FloatingPanel, IconButton, TooltipLabel } from "@/features/editor/FloatingPanel";

const TOOLS: { tool: Tool; label: string; icon: ComponentType<LucideProps> }[] = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "pan", label: "Pan", icon: Hand },
  { tool: "sticky", label: "Sticky note", icon: StickyNote },
  { tool: "text", label: "Text", icon: Type },
  { tool: "rect", label: "Rectangle", icon: Square },
  { tool: "ellipse", label: "Ellipse", icon: Circle },
  { tool: "freehand", label: "Pen", icon: Pen },
  { tool: "connector", label: "Connector", icon: MoveUpRight },
];

const SHORTCUT = Object.fromEntries(
  Object.entries(TOOL_KEYS).map(([key, tool]) => [tool, key.toUpperCase()]),
) as Record<Tool, string>;

/** Marks the drawer's trigger, so clicking it doesn't count as clicking outside the drawer. */
export const SHAPES_BUTTON_ATTR = "data-shapes-button";

/** Vertical tool picker on the left edge (Miro style). */
export function Toolbar() {
  const activeTool = useUiStore((s) => s.activeTool);
  const setTool = useUiStore((s) => s.setTool);
  const stickyColor = useUiStore((s) => s.stickyColor);
  const drawerOpen = useUiStore((s) => s.shapeDrawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setShapeDrawerOpen);

  return (
    <FloatingPanel className="top-1/2 left-3 flex -translate-y-1/2 flex-col items-center gap-1 p-1">
      <ToggleGroup
        type="single"
        orientation="vertical"
        className="flex-col"
        value={activeTool}
        // Clicking the active tool again reports "", which isn't a tool.
        onValueChange={(value) => value && setTool(value as Tool)}
        aria-label="Tools"
      >
        {TOOLS.map(({ tool, label, icon: Icon }) => {
          const item = (
            <ToggleGroupItem
              value={tool}
              aria-label={label}
              className="h-9 w-9 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700"
              onMouseDown={(e) => e.preventDefault()}
            >
              <Icon
                fill={tool === "sticky" ? stickyColor : "none"}
                className={cn(tool === "sticky" && "stroke-[1.5]")}
              />
            </ToggleGroupItem>
          );
          return (
            <Tooltip key={tool}>
              {tool === "sticky" ? (
                <StickyColorPopover open={activeTool === "sticky"}>
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                </StickyColorPopover>
              ) : (
                <TooltipTrigger asChild>{item}</TooltipTrigger>
              )}
              <TooltipContent side="right">
                <TooltipLabel label={label} shortcut={SHORTCUT[tool]} />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
      <Separator className="my-0.5 w-6" />
      <IconButton
        label="Shapes"
        side="right"
        className={cn("h-9 w-9", drawerOpen && "bg-blue-100 text-blue-700 hover:bg-blue-100")}
        aria-pressed={drawerOpen}
        {...{ [SHAPES_BUTTON_ATTR]: "" }}
        onClick={() => setDrawerOpen(!drawerOpen)}
      >
        <Shapes />
      </IconButton>
    </FloatingPanel>
  );
}

/**
 * Colour choice for new stickies, shown beside the sticky tool while it's active (Miro
 * style). It closes by switching tools, not by clicking elsewhere, so the click that
 * places the sticky doesn't dismiss it first.
 */
function StickyColorPopover({ open, children }: { open: boolean; children: ReactNode }) {
  const stickyColor = useUiStore((s) => s.stickyColor);
  const setStickyColor = useUiStore((s) => s.setStickyColor);

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side="right"
        sideOffset={12}
        className="w-auto p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Sticky colour">
          {STICKY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color === stickyColor}
              aria-label={`Sticky colour ${color}`}
              className={cn(
                "h-7 w-7 rounded-md border shadow-sm transition-transform hover:scale-110",
                color === stickyColor && "ring-2 ring-blue-500 ring-offset-1",
              )}
              style={{ backgroundColor: color }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setStickyColor(color)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
