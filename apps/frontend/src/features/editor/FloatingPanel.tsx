import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The card every editor panel floats on. Panels are DOM siblings of the Stage container,
 * so their pointer and wheel events never reach Konva.
 */
export const FloatingPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("absolute z-10 rounded-xl border bg-background shadow-md", className)}
      {...props}
    />
  ),
);
FloatingPanel.displayName = "FloatingPanel";

/** "Name  Shortcut" tooltip content. */
export function TooltipLabel({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {shortcut && <kbd className="font-sans opacity-60">{shortcut}</kbd>}
    </span>
  );
}

interface IconButtonProps extends ButtonProps {
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}

/** A ghost icon button with a tooltip, which still shows when the button is disabled. */
export function IconButton({
  label,
  shortcut,
  side = "bottom",
  disabled,
  className,
  children,
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      className={cn("h-8 w-8", className)}
      // Keeps focus off the button, so canvas shortcuts (space, delete) keep working.
      onMouseDown={(e) => e.preventDefault()}
      {...props}
    >
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons get no pointer events, so the wrapper hosts the tooltip. */}
        {disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent side={side}>
        <TooltipLabel label={label} shortcut={shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Platform-appropriate name for the Ctrl/⌘ key in shortcut hints. */
export const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
