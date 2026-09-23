import { memo } from "react";
import { Shape } from "react-konva";

const GRID = 24;
/** Below this on-screen spacing, the grid doubles its step so it doesn't turn into noise. */
const MIN_SPACING_PX = 14;
const DOT = 2;
const COLOR = "#d4d4d8";

/**
 * A single shape that paints the dot grid in screen space, instead of one node per dot.
 * Redrawn whenever the stage transform changes.
 */
export const DotGrid = memo(function DotGrid() {
  return (
    <Shape
      listening={false}
      sceneFunc={(context, shape) => {
        const stage = shape.getStage();
        const canvas = shape.getLayer()?.getCanvas();
        if (!stage || !canvas) return;
        const scale = stage.scaleX();
        let step = GRID * scale;
        while (step < MIN_SPACING_PX) step *= 2;

        const ctx = context._context;
        const ratio = canvas.getPixelRatio();
        ctx.save();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = COLOR;
        ctx.beginPath();
        const startX = (((stage.x() % step) + step) % step) - DOT / 2;
        const startY = (((stage.y() % step) + step) % step) - DOT / 2;
        for (let x = startX; x < stage.width(); x += step) {
          for (let y = startY; y < stage.height(); y += step) ctx.rect(x, y, DOT, DOT);
        }
        ctx.fill();
        ctx.restore();
      }}
    />
  );
});
