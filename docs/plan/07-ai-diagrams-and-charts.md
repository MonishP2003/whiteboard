# Stage 7 — AI diagrams, then AI charts (M6)

## Goal

Type a prompt in the bottom bar ("login flow with OAuth and 2FA") and get a laid-out diagram of shapes and connectors inserted into the board. Then the same for charts ("bar chart of monthly sales Jan–Jun"), inserted as an image. Gemini is called only from the backend and never returns coordinates; elkjs on the frontend lays out the graph.

The paywall comes in Stage 8. Here the AI routes use `authenticate` + `rateLimit` + `validate`; `requireSubscription` is added to the chain in Stage 8.

## Tasks

### 1. Shared schemas (`packages/shared/src/ai.ts`)

```ts
DiagramRequest  = { prompt: string (3–500 chars) }
DiagramResponse = {
  nodes: { id: string; label: string; kind: 'process' | 'decision' | 'start' | 'end' | 'data' | 'note' }[]  // max ~40
  edges: { from: string; to: string; label?: string }[]                                                   // max ~80
}
ChartRequest    = { prompt: string }
ChartResponse   = { type: 'bar' | 'line' | 'pie'; title: string; labels: string[]; series: { name: string; data: number[] }[] }
```

Add refinements the JSON schema can't express: every edge references existing node IDs, node IDs are unique, every series has `labels.length` data points, pie charts have exactly one series.

### 2. Backend

**Config & secrets:** `GEMINI_API_KEY` and `GEMINI_MODEL` (default a current free-tier Flash model) in `env.ts`. Add `/whiteboard/prod/GEMINI_API_KEY` to Terraform with a placeholder + `ignore_changes`, then set it with the CLI. Add it to `infra/docker/api/deploy.sh`'s env file generation if that isn't already a wildcard fetch.

**`integrations/gemini.client.ts`** — the only file that imports `@google/genai`:
- `generateJson({ system, prompt, responseSchema }): Promise<unknown>` using `responseMimeType: "application/json"` and `responseSchema`.
- Timeout (~20 s) with `AbortController`. Map 429 → `AppError(429, "AI_RATE_LIMITED")`, other upstream failures → `AppError(502, "AI_UPSTREAM_ERROR")`.
- No business logic, no Zod here.

**`services/ai.service.ts`**
- Build prompts: a system instruction describing the output (node kinds, "IDs are short slugs", "don't include coordinates", "prefer fewer than 20 nodes") plus the user prompt.
- Call the client, validate with the shared Zod schema. On failure, **retry with the validation error** appended ("Your previous output was invalid: …; return corrected JSON"). At most 2 retries, then `AppError(502, "AI_INVALID_OUTPUT")`.
- Record every attempt's outcome in `AiUsage` (`kind`, `success`) via `aiUsage.repository.ts` (a new repository file).
- `generateDiagram`, `generateChart`.

**`middlewares/rateLimit.ts`** — per-user AI limits, calling a service (`aiService.checkQuota(userId)`), which counts `AiUsage` rows in a window via the repository: e.g. 5 per minute and 50 per day. Throw `AppError(429, "AI_QUOTA_EXCEEDED")`. Keep limits well under Gemini's free-tier limits, which are per project, not per user.

**Routes:** `POST /ai/diagram`, `POST /ai/chart` with `preHandler: [authenticate, rateLimit, validate({ body })]`.

**Tests:** unit tests for `ai.service` with a fake Gemini client: valid first try; invalid then valid (retry prompt includes the error); invalid three times → 502; usage recorded each time. No test hits the real API.

### 3. Frontend — diagrams

- `features/ai-prompt/AiPromptBar.tsx`: enable the Stage 5 bar. Mode switch Diagram / Chart, input, submit, loading state (Gemini can take several seconds), error toast mapped from the error code.
- `lib/elkLayout.ts`: `elkjs/lib/elk.bundled.js` (or the worker build to keep the UI responsive). Input: nodes with estimated sizes (measure the label with a Konva `Text` or a width heuristic; `decision` nodes larger), edges. Options: `elk.algorithm: "layered"`, `elk.direction: "DOWN"`, sensible `spacing.nodeNode` and `layered.spacing.nodeNodeBetweenLayers`. Output: `x, y` per node.
- `features/ai-prompt/insertDiagram.ts`: map kinds to shapes (process → rect, decision → rotated rect or a new `diamond` shape if you add one, start/end → ellipse, data → rect with a different fill, note → sticky). Generate fresh shape IDs, keep a map from AI node ID → shape ID for connectors, offset everything so the diagram's top-left sits at the viewport centre (or to the right of existing content). Insert all shapes and connectors in **one store action** → one undo step. Select the inserted shapes and fit the view to them.

### 4. Frontend — charts

- `lib/renderChart.ts`: Chart.js (`chart.js/auto` or tree-shaken registrations) on an offscreen `<canvas>` (e.g. 800×500, `animation: false`, `responsive: false`, white background plugin), then `canvas.toDataURL("image/png")`. Destroy the chart afterwards.
- Insert an `image` shape with that data URL at the viewport centre; `ImageShape` loads it with `useImage` or `new Image()`.
- Consider compressing to JPEG/WebP or a smaller size if boards grow near the 2 MB body limit from Stage 3.

## Done when

- [ ] "Checkout flow for an online store" produces a readable top-down diagram with labelled arrows, no overlapping nodes, inserted at the viewport and undoable in one step.
- [ ] A prompt that makes Gemini return bad JSON (force it in a unit test) retries and then fails with a clear toast, not a crash.
- [ ] "Pie chart of browser market share" inserts a chart image that survives reload and appears in PNG and SVG exports.
- [ ] The 6th request within a minute returns 429 and the UI says so.
- [ ] Searching the frontend bundle and browser network tab finds no Gemini key or Gemini URL.
- [ ] Works on CloudFront with the key coming from SSM.

## Gotchas

- Gemini's `responseSchema` supports a subset of OpenAPI schema. Keep it simple (objects, arrays, enums, strings, numbers) and enforce the rest with Zod.
- The free tier has low per-minute limits and lets Google use prompts to improve its products. Don't send anything private, and say so near the prompt bar.
- elkjs is large (~1 MB+). Load it with a dynamic `import()` when the prompt bar is first used.
