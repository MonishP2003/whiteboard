import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { PRO_MONTHLY, type MeResponse } from "@whiteboard/shared";
import { buildApp } from "../../src/app.js";
import { prisma, truncateAll } from "./db.js";

// vitest.config.ts sets this secret and leaves the Razorpay keys unset.
const WEBHOOK_SECRET = "test_webhook_secret";
const ORDER = "order_test_1";

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

/** The row /payments/order would have stored (that route needs real Razorpay keys). */
function createPayment(userId: string) {
  return prisma.payment.create({
    data: {
      userId,
      plan: PRO_MONTHLY.plan,
      amountPaise: PRO_MONTHLY.amountPaise,
      razorpayOrderId: ORDER,
    },
  });
}

// Deliberately not JSON.stringify'd: spacing Razorpay might send, which re-serializing loses.
const capturedBody = (amount: number = PRO_MONTHLY.amountPaise) => `{
  "entity": "event",
  "event": "payment.captured",
  "payload": { "payment": { "entity": {
    "id": "pay_test_1", "order_id": "${ORDER}", "amount": ${amount}, "currency": "INR",
    "status": "captured"
  } } }
}`;

const sign = (body: string) => createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

function sendWebhook(body: string, signature = sign(body)) {
  return app.inject({
    method: "POST",
    url: "/api/payments/webhook",
    headers: { "content-type": "application/json", "x-razorpay-signature": signature },
    payload: body,
  });
}

const me = async (cookie: string) =>
  (await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json<MeResponse>();

const tryAi = (cookie: string) =>
  // Too short to be valid: past the paywall it's a 400, so Gemini is never called.
  app.inject({
    method: "POST",
    url: "/api/ai/diagram",
    headers: { cookie },
    payload: { prompt: "ab" },
  });

describe("payment webhook", () => {
  test("a signed payment.captured activates Pro; AI goes from 402 to allowed", async () => {
    const { cookie, userId } = await register();
    await createPayment(userId);

    const before = await tryAi(cookie);
    expect(before.statusCode).toBe(402);
    expect(before.json()).toEqual({ error: "SUBSCRIPTION_REQUIRED" });
    expect((await me(cookie)).subscription).toBeNull();

    const res = await sendWebhook(capturedBody());
    expect(res.statusCode).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { razorpayOrderId: ORDER } });
    expect(payment).toMatchObject({ status: "CAPTURED", razorpayPaymentId: "pay_test_1" });
    const { subscription } = await me(cookie);
    expect(subscription?.status).toBe("ACTIVE");
    const days = (Date.parse(subscription!.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    expect((await tryAi(cookie)).statusCode).toBe(400);
  });

  test("replaying the webhook changes nothing", async () => {
    const { userId } = await register();
    await createPayment(userId);
    await sendWebhook(capturedBody());
    const first = await prisma.subscription.findUniqueOrThrow({ where: { userId } });

    const replay = await sendWebhook(capturedBody());
    expect(replay.statusCode).toBe(200);
    const second = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
    expect(second.expiresAt).toEqual(first.expiresAt);
    expect(await prisma.subscription.count()).toBe(1);
  });

  test("concurrent duplicate deliveries extend the subscription once", async () => {
    const { userId } = await register();
    await createPayment(userId);
    const results = await Promise.all([
      sendWebhook(capturedBody()),
      sendWebhook(capturedBody()),
      sendWebhook(capturedBody()),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
    const days = (sub.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(30);
  });

  test("a modified body or wrong signature is 400 and changes nothing", async () => {
    const { userId } = await register();
    await createPayment(userId);
    const body = capturedBody();

    const tampered = await sendWebhook(body.replace("pay_test_1", "pay_test_2"), sign(body));
    expect(tampered.statusCode).toBe(400);
    expect(tampered.json()).toEqual({ error: "INVALID_SIGNATURE" });

    const wrong = await sendWebhook(body, "0".repeat(64));
    expect(wrong.statusCode).toBe(400);

    const missing = await app.inject({
      method: "POST",
      url: "/api/payments/webhook",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(missing.statusCode).toBe(400);

    expect(await prisma.subscription.count()).toBe(0);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { razorpayOrderId: ORDER } });
    expect(payment.status).toBe("CREATED");
  });

  test("an amount mismatch is acknowledged but doesn't activate", async () => {
    const { userId } = await register();
    await createPayment(userId);
    const res = await sendWebhook(capturedBody(100));
    expect(res.statusCode).toBe(200);
    expect(await prisma.subscription.count()).toBe(0);
  });

  test("an expired subscription is back behind the paywall", async () => {
    const { cookie, userId } = await register();
    await createPayment(userId);
    await sendWebhook(capturedBody());
    await prisma.subscription.update({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await tryAi(cookie)).statusCode).toBe(402);
    expect((await me(cookie)).subscription?.status).toBe("EXPIRED");
  });
});

describe("POST /payments/order", () => {
  test("requires auth", async () => {
    const res = await app.inject({ method: "POST", url: "/api/payments/order" });
    expect(res.statusCode).toBe(401);
  });

  test("is 503 without Razorpay keys", async () => {
    const { cookie } = await register();
    const res = await app.inject({
      method: "POST",
      url: "/api/payments/order",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "PAYMENTS_NOT_CONFIGURED" });
  });
});

test("other routes still parse JSON normally", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "bob@example.com", password: "password123", name: "Bob" },
  });
  expect(res.statusCode).toBe(201);
});
