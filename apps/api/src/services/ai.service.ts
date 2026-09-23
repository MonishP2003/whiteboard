import type { ZodType, ZodTypeDef } from "zod";
import {
  AI_LIMITS,
  CHART_TYPES,
  ChartResponseSchema,
  DIAGRAM_NODE_KINDS,
  DiagramResponseSchema,
  type ChartResponse,
  type DiagramResponse,
} from "@whiteboard/shared";
import {
  geminiClient,
  SchemaType,
  type GeminiClient,
  type ResponseSchema,
} from "../integrations/gemini.client.js";
import {
  aiUsageRepository,
  type AiKind,
  type AiUsageRepository,
} from "../repositories/aiUsage.repository.js";
import { AppError } from "../utils/AppError.js";

/** Retries after the first attempt when the output fails validation. */
export const MAX_RETRIES = 2;

/**
 * Per-user limits, counted over every Gemini call (retries included). Well under Gemini's
 * free-tier limits, which are per project, not per user.
 */
export const AI_QUOTA = [
  { windowMs: 60_000, max: 5 },
  { windowMs: 24 * 60 * 60_000, max: 50 },
] as const;

// ---- Prompts and Gemini response schemas ----
// Gemini's schema supports a subset of OpenAPI, so it only fixes the shape; Zod checks the rest.

const DIAGRAM_SYSTEM = `You turn a description into a flowchart or diagram as a graph of nodes and edges.
Return JSON only, matching the response schema.
- Each node has a unique "id" (a short lowercase slug such as "login" or "check_2fa"), a concise "label" (at most ${AI_LIMITS.maxNodeLabelLength} characters, ideally under 30), and a "kind":
  - "start" / "end": where the flow begins and finishes
  - "process": a step or action
  - "decision": a yes/no or branching question; label its outgoing edges (e.g. "Yes", "No")
  - "data": stored or external data (a database, an API, a file)
  - "note": a side remark not part of the flow (use sparingly)
- Each edge goes "from" one node id "to" another existing node id, with an optional short "label" (at most ${AI_LIMITS.maxEdgeLabelLength} characters).
- Prefer fewer than 20 nodes; never more than ${AI_LIMITS.maxNodes}.
- Do not include coordinates, sizes, colours or any layout information.
- If the description is not a process or structure, draw the closest sensible diagram of it.`;

const DIAGRAM_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    nodes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          kind: { type: SchemaType.STRING, format: "enum", enum: [...DIAGRAM_NODE_KINDS] },
        },
        required: ["id", "label", "kind"],
        propertyOrdering: ["id", "label", "kind"],
      },
    },
    edges: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          from: { type: SchemaType.STRING },
          to: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
        },
        required: ["from", "to"],
        propertyOrdering: ["from", "to", "label"],
      },
    },
  },
  required: ["nodes", "edges"],
  propertyOrdering: ["nodes", "edges"],
};

const CHART_SYSTEM = `You turn a description into data for a simple chart.
Return JSON only, matching the response schema.
- "type": "bar", "line" or "pie". Use the type the description asks for; otherwise pick the one that fits the data best.
- "title": a short chart title.
- "labels": the category or x-axis labels, at most ${AI_LIMITS.maxChartLabels}.
- "series": one or more named series (at most ${AI_LIMITS.maxChartSeries}); each "data" array has exactly one number per label, in the same order.
- A pie chart has exactly one series with non-negative values.
- Numbers are plain numbers (no units, no thousands separators, no strings).
- If the description does not give the data, use plausible illustrative values.`;

const CHART_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    type: { type: SchemaType.STRING, format: "enum", enum: [...CHART_TYPES] },
    title: { type: SchemaType.STRING },
    labels: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    series: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          data: { type: SchemaType.ARRAY, items: { type: SchemaType.NUMBER } },
        },
        required: ["name", "data"],
        propertyOrdering: ["name", "data"],
      },
    },
  },
  required: ["type", "title", "labels", "series"],
  propertyOrdering: ["type", "title", "labels", "series"],
};

/** The user's text, fenced so it reads as content rather than instructions. */
function userPrompt(kind: AiKind, prompt: string): string {
  return `Create a ${kind} for this description:\n"""\n${prompt}\n"""`;
}

export function retryPrompt(original: string, error: string): string {
  return `${original}\n\nYour previous output was invalid: ${error}\nReturn corrected JSON.`;
}

/** Zod issues as one short line each, e.g. `edges.3.to: edge references unknown node id "x"`. */
function describeIssues(error: { issues: { path: (string | number)[]; message: string }[] }) {
  return error.issues
    .slice(0, 10)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

/** Drops self-loops, duplicate edges and empty labels, which lay out and render badly. */
function tidyDiagram(d: DiagramResponse): DiagramResponse {
  const seen = new Set<string>();
  const edges = d.edges.flatMap((e) => {
    const key = `${e.from}\u0000${e.to}`;
    if (e.from === e.to || seen.has(key)) return [];
    seen.add(key);
    const label = e.label?.trim();
    return [label ? { from: e.from, to: e.to, label } : { from: e.from, to: e.to }];
  });
  return { nodes: d.nodes, edges };
}

export function createAiService(
  gemini: GeminiClient,
  usage: AiUsageRepository,
  now: () => Date = () => new Date(),
) {
  /**
   * Calls Gemini and validates the output, retrying with the validation error appended.
   * Every call is recorded in AiUsage, failed or not.
   */
  async function generate<T>(
    userId: string,
    kind: AiKind,
    system: string,
    responseSchema: ResponseSchema,
    schema: ZodType<T, ZodTypeDef, unknown>,
    prompt: string,
  ): Promise<T> {
    const original = userPrompt(kind, prompt);
    let text = original;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let raw: unknown;
      try {
        raw = await gemini.generateJson({ system, prompt: text, responseSchema });
      } catch (err) {
        // Nothing was sent to Gemini, so there's nothing to count.
        if (!(err instanceof AppError && err.code === "AI_NOT_CONFIGURED")) {
          await usage.record({ userId, kind, success: false });
        }
        throw err;
      }
      const parsed = schema.safeParse(raw);
      await usage.record({ userId, kind, success: parsed.success });
      if (parsed.success) return parsed.data;
      text = retryPrompt(original, describeIssues(parsed.error));
    }
    throw new AppError(502, "AI_INVALID_OUTPUT");
  }

  return {
    /** Throws 429 AI_QUOTA_EXCEEDED once the user hits any window's limit. */
    async checkQuota(userId: string): Promise<void> {
      const t = now().getTime();
      for (const { windowMs, max } of AI_QUOTA) {
        const used = await usage.countSince(userId, new Date(t - windowMs));
        if (used >= max) throw new AppError(429, "AI_QUOTA_EXCEEDED");
      }
    },

    async generateDiagram(userId: string, prompt: string): Promise<DiagramResponse> {
      const diagram = await generate(
        userId,
        "diagram",
        DIAGRAM_SYSTEM,
        DIAGRAM_SCHEMA,
        DiagramResponseSchema,
        prompt,
      );
      return tidyDiagram(diagram);
    },

    generateChart(userId: string, prompt: string): Promise<ChartResponse> {
      return generate(userId, "chart", CHART_SYSTEM, CHART_SCHEMA, ChartResponseSchema, prompt);
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;

export const aiService = createAiService(geminiClient, aiUsageRepository);
