import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PRESET_MIME, SHAPE_PRESETS, type ShapePreset } from "@/canvas/presets";
import { addAndSelect } from "@/canvas/tools/types";
import { viewportCentreWorld } from "@/canvas/viewport";
import { useUiStore } from "@/store/uiStore";
import { SHAPES_BUTTON_ATTR } from "@/features/toolbar/Toolbar";

const byId = (id: string) => SHAPE_PRESETS.find((p) => p.id === id)!;
const SECTIONS: { title: string; presets: ShapePreset[] }[] = [
  { title: "Shapes", presets: ["rect", "rounded-rect", "ellipse", "diamond"].map(byId) },
  { title: "Text", presets: ["heading", "body"].map(byId) },
  { title: "Sticky notes", presets: SHAPE_PRESETS.filter((p) => p.id.startsWith("sticky-")) },
];

/**
 * Slide-out library of shape presets. Click inserts at the centre of the view; drag drops
 * where the pointer is released (the Stage handles the drop). Non-modal, so the canvas
 * stays usable and can receive the drop.
 */
export function ShapeDrawer() {
  const open = useUiStore((s) => s.shapeDrawerOpen);
  const setOpen = useUiStore((s) => s.setShapeDrawerOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetContent
        side={null}
        overlay={false}
        className="top-16 bottom-16 left-[4.25rem] w-60 overflow-y-auto rounded-xl border p-4 shadow-md"
        // The toolbar button toggles the drawer itself.
        onInteractOutside={(e) => {
          const target = e.target as Element | null;
          if (target?.closest(`[${SHAPES_BUTTON_ATTR}]`)) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetTitle className="text-base">Shapes</SheetTitle>
        <SheetDescription className="mb-3 text-xs">
          Click to add, or drag onto the board.
        </SheetDescription>
        <div className="space-y-4">
          {SECTIONS.map(({ title, presets }) => (
            <section key={title}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {presets.map((preset) => (
                  <PresetTile key={preset.id} preset={preset} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PresetTile({ preset }: { preset: ShapePreset }) {
  return (
    <button
      type="button"
      draggable
      title={preset.label}
      aria-label={`Add ${preset.label.toLowerCase()}`}
      className="flex aspect-square cursor-grab items-center justify-center rounded-md border bg-background hover:bg-accent active:cursor-grabbing"
      onDragStart={(e) => {
        e.dataTransfer.setData(PRESET_MIME, preset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => addAndSelect(preset.create(viewportCentreWorld()))}
    >
      <PresetIcon id={preset.id} />
    </button>
  );
}

function PresetIcon({ id }: { id: string }): ReactNode {
  const box = "h-7 w-10 border-2 border-gray-800 bg-white";
  if (id === "rect") return <span className={box} />;
  if (id === "rounded-rect") return <span className={`${box} rounded-md`} />;
  if (id === "ellipse") return <span className={`${box} rounded-[50%]`} />;
  if (id === "diamond") return <DiamondIcon />;
  if (id === "heading") return <span className="text-lg font-bold">H</span>;
  if (id === "body") return <span className="text-sm">Aa</span>;
  const fill = id.slice("sticky-".length);
  return <span className="h-8 w-8 rounded-sm shadow" style={{ backgroundColor: fill }} />;
}

function DiamondIcon() {
  return (
    <svg viewBox="0 0 44 32" className="h-8 w-11" aria-hidden>
      <polygon points="22,2 42,16 22,30 2,16" fill="white" stroke="#1f2937" strokeWidth="2" />
    </svg>
  );
}
