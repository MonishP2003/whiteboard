import { beforeEach, describe, expect, test } from "vitest";
import type { ChartResponse, DiagramResponse } from "@whiteboard/shared";
import type { GeminiClient, GenerateJsonInput } from "../../src/integrations/gemini.client.js";
import type { AiKind, AiUsageRepository } from "../../src/repositories/aiUsage.repository.js";
import { AI_QUOTA, createAiService, MAX_RETRIES } from "../../src/services/ai.service.js";
import { AppError } from "../../src/utils/AppError.js";

const USER = "user-1";

const validDiagram: DiagramResponse = {
  nodes: [
    { id: "start", label: "Start", kind: "start" },
    { id: "pay", label: "Pay", kind: "process" },
    { id: "end", label: "Done", kind: "end" },
  ],
  edges: [
    { from: "start", to: "pay" },
    { from: "pay", to: "end", label: "ok" },
  ],
};

const danglingEdge = { ...validDiagram, edges: [{ from: "start", to: "nowhere" }] };

const validChart: ChartResponse = {
  type: "bar",
  title: "Sales",
  labels: ["Jan", "Feb"],
  series: [{ name: "2026", data: [1, 2] }],
};

/** Returns each queued output in turn (or throws it, if it's an Error). */
function fakeGemini(outputs: unknown[]) {
  const calls: GenerateJsonInput[] = [];
  const client: GeminiClient = {
    async generateJson(input) {
      calls.push(input);
      if (!outputs.length) throw new Error("no more fake outputs");
      const next = outputs.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, calls };
}

interface UsageRow {
  userId: string;
  kind: AiKind;
  success: boolean;
  createdAt: Date;
}

function fakeUsage(now: () => Date) {
  const rows: UsageRow[] = [];
  const repo: AiUsageRepository = {
    async record(data) {
      rows.push({ ...data, createdAt: now() });
    },
    async countSince(userId, since) {
      return rows.filter((r) => r.userId === userId && r.createdAt >= since).length;
    },
  };
  return { repo, rows };
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ status, code });
}

let clock: Date;
const now = () => clock;

beforeEach(() => {
  clock = new Date("2026-09-23T12:00:00Z");
});

function setup(outputs: unknown[]) {
  const gemini = fakeGemini(outputs);
  const usage = fakeUsage(now);
  return { ...gemini, ...usage, service: createAiService(gemini.client, usage.repo, now) };
}

describe("generateDiagram", () => {
  test("valid on the first try", async () => {
    const { service, calls, rows } = setup([validDiagram]);
    await expect(service.generateDiagram(USER, "checkout flow")).resolves.toEqual(validDiagram);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain("checkout flow");
    expect(calls[0]!.system).toMatch(/coordinates/);
    expect(rows).toMatchObject([{ userId: USER, kind: "diagram", success: true }]);
  });

  test("invalid then valid: the retry prompt includes the validation error", async () => {
    const { service, calls, rows } = setup([danglingEdge, validDiagram]);
    await expect(service.generateDiagram(USER, "checkout flow")).resolves.toEqual(validDiagram);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).toContain("checkout flow");
    expect(calls[1]!.prompt).toContain("Your previous output was invalid");
    expect(calls[1]!.prompt).toContain('unknown node id "nowhere"');
    expect(rows.map((r) => r.success)).toEqual([false, true]);
  });

  test("invalid every time → 502 AI_INVALID_OUTPUT after 2 retries", async () => {
    const { service, calls, rows } = setup([danglingEdge, "not json", { nodes: "nope" }]);
    await expectAppError(service.generateDiagram(USER, "checkout flow"), 502, "AI_INVALID_OUTPUT");
    expect(calls).toHaveLength(1 + MAX_RETRIES);
    expect(rows.map((r) => r.success)).toEqual([false, false, false]);
  });

  test("duplicate node ids are rejected", async () => {
    const dup = { ...validDiagram, nodes: [...validDiagram.nodes, validDiagram.nodes[0]] };
    const { service, calls } = setup([dup, validDiagram]);
    await service.generateDiagram(USER, "flow");
    expect(calls[1]!.prompt).toContain('duplicate node id "start"');
  });

  test("drops self-loops, duplicate edges and blank labels", async () => {
    const messy: DiagramResponse = {
      nodes: validDiagram.nodes,
      edges: [
        { from: "start", to: "pay", label: "  " },
        { from: "start", to: "pay", label: "again" },
        { from: "pay", to: "pay" },
      ],
    };
    const { service } = setup([messy]);
    await expect(service.generateDiagram(USER, "flow")).resolves.toEqual({
      nodes: validDiagram.nodes,
      edges: [{ from: "start", to: "pay" }],
    });
  });

  test("an upstream error is recorded and passed through, without retrying", async () => {
    const { service, calls, rows } = setup([new AppError(429, "AI_RATE_LIMITED")]);
    await expectAppError(service.generateDiagram(USER, "flow"), 429, "AI_RATE_LIMITED");
    expect(calls).toHaveLength(1);
    expect(rows.map((r) => r.success)).toEqual([false]);
  });

  test("a missing API key records nothing", async () => {
    const { service, rows } = setup([new AppError(503, "AI_NOT_CONFIGURED")]);
    await expectAppError(service.generateDiagram(USER, "flow"), 503, "AI_NOT_CONFIGURED");
    expect(rows).toEqual([]);
  });
});

describe("generateChart", () => {
  test("valid on the first try", async () => {
    const { service, rows } = setup([validChart]);
    await expect(service.generateChart(USER, "monthly sales")).resolves.toEqual(validChart);
    expect(rows).toMatchObject([{ kind: "chart", success: true }]);
  });

  test("mismatched data lengths and multi-series pies are retried", async () => {
    const short = { ...validChart, series: [{ name: "a", data: [1] }] };
    const pie = {
      ...validChart,
      type: "pie",
      series: [...validChart.series, ...validChart.series],
    };
    const { service, calls } = setup([short, pie, validChart]);
    await expect(service.generateChart(USER, "sales")).resolves.toEqual(validChart);
    expect(calls[1]!.prompt).toContain("1 data points but there are 2 labels");
    expect(calls[2]!.prompt).toContain("exactly one series");
  });
});

describe("checkQuota", () => {
  const [perMinute, perDay] = AI_QUOTA;

  test("allows up to the per-minute limit, then 429 until the minute passes", async () => {
    const { service } = setup(Array(perMinute.max).fill(validChart));
    for (let i = 0; i < perMinute.max; i++) {
      await service.checkQuota(USER);
      await service.generateChart(USER, "sales");
    }
    await expectAppError(service.checkQuota(USER), 429, "AI_QUOTA_EXCEEDED");
    await expect(service.checkQuota("someone-else")).resolves.toBeUndefined();

    clock = new Date(clock.getTime() + perMinute.windowMs + 1);
    await expect(service.checkQuota(USER)).resolves.toBeUndefined();
  });

  test("enforces the daily limit", async () => {
    const { service } = setup(Array(perDay.max).fill(validChart));
    for (let i = 0; i < perDay.max; i++) {
      await service.generateChart(USER, "sales");
      clock = new Date(clock.getTime() + perMinute.windowMs + 1);
    }
    await expectAppError(service.checkQuota(USER), 429, "AI_QUOTA_EXCEEDED");
  });
});
