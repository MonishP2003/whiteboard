import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MIXED, type Maybe } from "./fields";

export const PALETTE = [
  "transparent",
  "#ffffff",
  "#e5e7eb",
  "#9ca3af",
  "#4b5563",
  "#1f2937",
  "#000000",
  "#fecaca",
  "#fed7aa",
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
  "#ddd6fe",
  "#fbcfe8",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#AbC" / "abc123" → "#abc" / "#abc123"; null if it isn't a hex colour. */
function normalizeHex(input: string): string | null {
  const s = input.trim().toLowerCase();
  const withHash = s.startsWith("#") ? s : `#${s}`;
  return HEX.test(withHash) ? withHash : null;
}

/** A swatch, drawn as a checkerboard for "transparent" and striped for "mixed". */
function Swatch({ color, className }: { color: Maybe<string>; className?: string }) {
  const style =
    color === MIXED
      ? {
          background: "repeating-linear-gradient(45deg, #d1d5db 0 3px, #fff 3px 6px)",
        }
      : color === "transparent"
        ? {
            background:
              "conic-gradient(#e5e7eb 25%, #fff 0 50%, #e5e7eb 0 75%, #fff 0) 0 0 / 8px 8px",
          }
        : { backgroundColor: color };
  return <span className={cn("block rounded-sm border", className)} style={style} />;
}

interface ColorPickerProps {
  label: string;
  value: Maybe<string>;
  /** Called once per pick, so each pick is one scene change. */
  onChange: (color: string) => void;
  swatches?: readonly string[];
}

/** Swatch button opening a palette plus a hex input. */
export function ColorPicker({ label, value, onChange, swatches = PALETTE }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("");
  // Enter commits and closes, and closing blurs the input; only commit a given value once.
  const committed = useRef<string | null>(null);
  const typed = normalizeHex(hex);

  const commitHex = () => {
    if (!typed || typed === value || typed === committed.current) return;
    committed.current = typed;
    onChange(typed);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) return;
        committed.current = null;
        setHex(value === MIXED || value === "transparent" ? "" : value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value === MIXED ? "mixed" : value}`}
          className="flex h-8 items-center gap-2 rounded-md border px-1.5 text-xs hover:bg-accent"
        >
          <Swatch color={value} className="h-5 w-5" />
          <span className="w-14 truncate text-left tabular-nums">
            {value === MIXED ? "Mixed" : value === "transparent" ? "None" : value}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-auto p-2">
        <div className="grid grid-cols-7 gap-1" role="listbox" aria-label={label}>
          {swatches.map((color) => (
            <button
              key={color}
              type="button"
              role="option"
              aria-selected={color === value}
              title={color === "transparent" ? "None" : color}
              className={cn(
                "rounded-sm p-0.5 hover:bg-accent",
                color === value && "ring-2 ring-blue-500",
              )}
              onClick={() => {
                if (color !== value) onChange(color);
                setOpen(false);
              }}
            >
              <Swatch color={color} className="h-5 w-5" />
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            commitHex();
            setOpen(false);
          }}
        >
          <Swatch color={typed ?? MIXED} className="h-6 w-6 shrink-0" />
          <input
            value={hex}
            placeholder="#hex"
            aria-label={`${label} hex`}
            maxLength={7}
            spellCheck={false}
            className="h-7 w-full min-w-0 rounded-md border px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(e) => setHex(e.target.value)}
            onBlur={commitHex}
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}
