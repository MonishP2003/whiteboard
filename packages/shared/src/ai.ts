import { z } from "zod";

export const AI_LIMITS = {
  minPromptLength: 3,
  maxPromptLength: 500,
  maxNodes: 40,
  maxEdges: 80,
  maxNodeLabelLength: 80,
  maxEdgeLabelLength: 40,
  maxChartLabels: 50,
  maxChartSeries: 8,
  maxChartTitleLength: 120,
} as const;

const Prompt = z
  .string()
  .trim()
  .min(AI_LIMITS.minPromptLength, `At least ${AI_LIMITS.minPromptLength} characters`)
  .max(AI_LIMITS.maxPromptLength, `At most ${AI_LIMITS.maxPromptLength} characters`);

// ---- Diagrams ----

export const DIAGRAM_NODE_KINDS = ["process", "decision", "start", "end", "data", "note"] as const;
export const DiagramNodeKindSchema = z.enum(DIAGRAM_NODE_KINDS);
export type DiagramNodeKind = z.infer<typeof DiagramNodeKindSchema>;

export const DiagramRequestSchema = z.object({ prompt: Prompt });
export type DiagramRequest = z.infer<typeof DiagramRequestSchema>;

export const DiagramNodeSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(AI_LIMITS.maxNodeLabelLength),
  kind: DiagramNodeKindSchema,
});
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;

export const DiagramEdgeSchema = z.object({
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  label: z.string().trim().max(AI_LIMITS.maxEdgeLabelLength).optional(),
});
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;

/** Checks the model's JSON schema can't express: unique IDs, edges between known nodes. */
export const DiagramResponseSchema = z
  .object({
    nodes: z.array(DiagramNodeSchema).min(1).max(AI_LIMITS.maxNodes),
    edges: z.array(DiagramEdgeSchema).max(AI_LIMITS.maxEdges),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    d.nodes.forEach((n, i) => {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", i, "id"],
          message: `duplicate node id "${n.id}"`,
        });
      }
      ids.add(n.id);
    });
    d.edges.forEach((e, i) => {
      for (const end of ["from", "to"] as const) {
        if (!ids.has(e[end])) {
          ctx.addIssue({
            code: "custom",
            path: ["edges", i, end],
            message: `edge references unknown node id "${e[end]}"`,
          });
        }
      }
    });
  });
export type DiagramResponse = z.infer<typeof DiagramResponseSchema>;

// ---- Charts ----

export const CHART_TYPES = ["bar", "line", "pie"] as const;

export const ChartRequestSchema = z.object({ prompt: Prompt });
export type ChartRequest = z.infer<typeof ChartRequestSchema>;

/** Checks the model's JSON schema can't express: data lengths match, pies have one series. */
export const ChartResponseSchema = z
  .object({
    type: z.enum(CHART_TYPES),
    title: z.string().trim().max(AI_LIMITS.maxChartTitleLength),
    labels: z.array(z.string().max(80)).min(1).max(AI_LIMITS.maxChartLabels),
    series: z
      .array(
        z.object({
          name: z.string().max(80),
          data: z.array(z.number().finite()).max(AI_LIMITS.maxChartLabels),
        }),
      )
      .min(1)
      .max(AI_LIMITS.maxChartSeries),
  })
  .superRefine((c, ctx) => {
    c.series.forEach((s, i) => {
      if (s.data.length !== c.labels.length) {
        ctx.addIssue({
          code: "custom",
          path: ["series", i, "data"],
          message: `series "${s.name}" has ${s.data.length} data points but there are ${c.labels.length} labels`,
        });
      }
    });
    if (c.type === "pie") {
      if (c.series.length !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["series"],
          message: `pie charts must have exactly one series, got ${c.series.length}`,
        });
      }
      if (c.series.some((s) => s.data.some((v) => v < 0))) {
        ctx.addIssue({
          code: "custom",
          path: ["series"],
          message: "pie chart values must not be negative",
        });
      }
    }
  });
export type ChartResponse = z.infer<typeof ChartResponseSchema>;

/** Error codes the AI routes return, beyond the generic ones. */
export type AiErrorCode =
  | "AI_QUOTA_EXCEEDED"
  | "AI_RATE_LIMITED"
  | "AI_UPSTREAM_ERROR"
  | "AI_INVALID_OUTPUT"
  | "AI_NOT_CONFIGURED";
