import { z } from "zod";

export const SCENE_VERSION = 1;

export const SCENE_LIMITS = {
  maxShapes: 5_000,
  maxConnectors: 5_000,
  /** Flat [x0, y0, x1, y1, …] array, so this is 5 000 points. */
  maxFreehandCoords: 10_000,
  maxIdLength: 64,
  maxTextLength: 10_000,
  maxLabelLength: 500,
  /** Image `src` is usually a data URL (AI charts); the board PUT body limit is 2 MB. */
  maxImageSrcLength: 1_500_000,
} as const;

const Id = z.string().min(1).max(SCENE_LIMITS.maxIdLength);
const Coord = z.number().finite();
const Size = z.number().finite().nonnegative();
const Color = z.string().max(64);

export const StyleSchema = z.object({
  fill: Color,
  stroke: Color,
  strokeWidth: z.number().finite().min(0).max(100),
  opacity: z.number().min(0).max(1),
  fontSize: z.number().finite().positive().max(1_000).optional(),
  fontFamily: z.string().max(100).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  /** Rects only. Optional so boards saved before it existed stay valid. */
  cornerRadius: z.number().finite().min(0).max(1_000).optional(),
});
export type Style = z.infer<typeof StyleSchema>;

const base = {
  id: Id,
  x: Coord,
  y: Coord,
  rotation: z.number().finite(),
  style: StyleSchema,
};
const sized = { width: Size, height: Size };

/** Optional label drawn centred inside rects, ellipses and diamonds. */
const label = { text: z.string().max(SCENE_LIMITS.maxTextLength).optional() };

export const RectShapeSchema = z.object({ type: z.literal("rect"), ...base, ...sized, ...label });
export const EllipseShapeSchema = z.object({
  type: z.literal("ellipse"),
  ...base,
  ...sized,
  ...label,
});
/** A rhombus touching the midpoints of its box's sides (flowchart decisions). */
export const DiamondShapeSchema = z.object({
  type: z.literal("diamond"),
  ...base,
  ...sized,
  ...label,
});
export const TextShapeSchema = z.object({
  type: z.literal("text"),
  ...base,
  width: Size,
  text: z.string().max(SCENE_LIMITS.maxTextLength),
});
export const StickyShapeSchema = z.object({
  type: z.literal("sticky"),
  ...base,
  ...sized,
  text: z.string().max(SCENE_LIMITS.maxTextLength),
});
export const FreehandShapeSchema = z.object({
  type: z.literal("freehand"),
  ...base,
  /** Flat [x0, y0, x1, y1, …], relative to the shape's x/y. */
  points: z
    .array(Coord)
    .max(SCENE_LIMITS.maxFreehandCoords)
    .refine((p) => p.length % 2 === 0, "points must have an even length"),
});
export const ImageShapeSchema = z.object({
  type: z.literal("image"),
  ...base,
  ...sized,
  src: z.string().max(SCENE_LIMITS.maxImageSrcLength),
});

export const ShapeSchema = z.discriminatedUnion("type", [
  RectShapeSchema,
  EllipseShapeSchema,
  DiamondShapeSchema,
  TextShapeSchema,
  StickyShapeSchema,
  FreehandShapeSchema,
  ImageShapeSchema,
]);
export type Shape = z.infer<typeof ShapeSchema>;
export type ShapeType = Shape["type"];
export type RectShape = z.infer<typeof RectShapeSchema>;
export type EllipseShape = z.infer<typeof EllipseShapeSchema>;
export type DiamondShape = z.infer<typeof DiamondShapeSchema>;
export type TextShape = z.infer<typeof TextShapeSchema>;
export type StickyShape = z.infer<typeof StickyShapeSchema>;
export type FreehandShape = z.infer<typeof FreehandShapeSchema>;
export type ImageShape = z.infer<typeof ImageShapeSchema>;

export const ConnectorSchema = z.object({
  id: Id,
  fromId: Id,
  toId: Id,
  style: StyleSchema,
  label: z.string().max(SCENE_LIMITS.maxLabelLength).optional(),
  /** Arrow heads. Missing means the default: a head at the end only. */
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
  dashed: z.boolean().optional(),
});
export type Connector = z.infer<typeof ConnectorSchema>;

export const SceneSchema = z
  .object({
    version: z.literal(SCENE_VERSION),
    shapes: z.record(Id, ShapeSchema),
    /** Shape IDs, back to front. This is the z-order. */
    order: z.array(Id).max(SCENE_LIMITS.maxShapes),
    connectors: z.record(Id, ConnectorSchema),
  })
  .superRefine((scene, ctx) => {
    const shapeIds = Object.keys(scene.shapes);
    if (shapeIds.length > SCENE_LIMITS.maxShapes) {
      ctx.addIssue({ code: "custom", path: ["shapes"], message: "too many shapes" });
      return;
    }
    if (Object.keys(scene.connectors).length > SCENE_LIMITS.maxConnectors) {
      ctx.addIssue({ code: "custom", path: ["connectors"], message: "too many connectors" });
      return;
    }
    for (const [key, shape] of Object.entries(scene.shapes)) {
      if (shape.id !== key) {
        ctx.addIssue({ code: "custom", path: ["shapes", key, "id"], message: "id must match key" });
      }
    }
    const inOrder = new Set(scene.order);
    if (
      inOrder.size !== scene.order.length ||
      inOrder.size !== shapeIds.length ||
      shapeIds.some((id) => !inOrder.has(id))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["order"],
        message: "order must list every shape once",
      });
    }
    for (const [key, c] of Object.entries(scene.connectors)) {
      if (c.id !== key) {
        ctx.addIssue({
          code: "custom",
          path: ["connectors", key, "id"],
          message: "id must match key",
        });
      }
      if (!(c.fromId in scene.shapes) || !(c.toId in scene.shapes)) {
        ctx.addIssue({
          code: "custom",
          path: ["connectors", key],
          message: "connector references a missing shape",
        });
      }
    }
  });
export type Scene = z.infer<typeof SceneSchema>;

export function emptyScene(): Scene {
  return { version: SCENE_VERSION, shapes: {}, order: [], connectors: {} };
}
