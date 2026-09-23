import { afterAll, expect, test } from "vitest";
import { buildApp } from "../../src/app.js";

const app = await buildApp();
afterAll(() => app.close());

test("GET /api/health returns ok", async () => {
  const res = await app.inject({ url: "/api/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
});
