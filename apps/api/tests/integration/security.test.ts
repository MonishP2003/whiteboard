import { afterAll, expect, test } from "vitest";
import { buildApp } from "../../src/app.js";
import { AUTH_RATE_LIMIT } from "../../src/routes/auth.routes.js";

// Own app instance: the rate limiter's in-memory counters must not leak into other files.
const app = await buildApp();
afterAll(() => app.close());

test("responses carry helmet's security headers", async () => {
  const res = await app.inject({ url: "/api/health" });
  expect(res.headers["x-content-type-options"]).toBe("nosniff");
  expect(res.headers["strict-transport-security"]).toBeDefined();
});

test("login is rate limited per client IP", async () => {
  const login = () =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "wrong-password" },
    });

  for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
    expect((await login()).statusCode).toBe(401);
  }
  const res = await login();
  expect(res.statusCode).toBe(429);
  expect(res.json()).toEqual({ error: "RATE_LIMITED" });
  expect(res.headers["retry-after"]).toBeDefined();
});
