import { afterAll, beforeEach, describe, expect, test } from "vitest";
import type { MeResponse } from "@whiteboard/shared";
import { buildApp } from "../../src/app.js";
import { AI_QUOTA } from "../../src/services/ai.service.js";
import { prisma, truncateAll } from "./db.js";

// None of these requests reach Gemini: each is stopped by auth, the quota or validation.

const app = await buildApp();
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(truncateAll);

async function register() {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "ann@example.com", password: "password123", name: "Ann" },
  });
  const c = res.cookies.find((c) => c.name === "access_token")!;
  return { cookie: `access_token=${c.value}`, userId: res.json<MeResponse>().id };
}

describe("AI routes", () => {
  test("require auth", async () => {
    for (const url of ["/api/ai/diagram", "/api/ai/chart"]) {
      const res = await app.inject({ method: "POST", url, payload: { prompt: "a flow" } });
      expect(res.statusCode).toBe(401);
    }
  });

  test("reject a too-short or too-long prompt", async () => {
    const { cookie } = await register();
    for (const prompt of ["", "ab", "x".repeat(501)]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/ai/diagram",
        headers: { cookie },
        payload: { prompt },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  test("the request after the per-minute quota is 429", async () => {
    const { cookie, userId } = await register();
    const [perMinute] = AI_QUOTA;
    await prisma.aiUsage.createMany({
      data: Array.from({ length: perMinute.max }, () => ({
        userId,
        kind: "diagram",
        success: true,
      })),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/chart",
      headers: { cookie },
      payload: { prompt: "pie chart of browser market share" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "AI_QUOTA_EXCEEDED" });
  });
});
