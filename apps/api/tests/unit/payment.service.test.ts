import { beforeEach, describe, expect, test } from "vitest";
import { PRO_MONTHLY } from "@whiteboard/shared";
import type { RazorpayClient } from "../../src/integrations/razorpay.client.js";
import type {
  PaymentRecord,
  PaymentRepository,
} from "../../src/repositories/payment.repository.js";
import { createPaymentService, extendExpiry } from "../../src/services/payment.service.js";
import { AppError } from "../../src/utils/AppError.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const USER = "user-1";
const ORDER = "order_abc";
const GOOD_SIG = "good-signature";

let clock: Date;
const now = () => clock;

function fakeRazorpay(keyId: string | null = "rzp_test_key") {
  const orders: unknown[] = [];
  const client: RazorpayClient = {
    keyId,
    async createOrder(input) {
      orders.push(input);
      return { id: ORDER, amount: input.amountPaise, currency: input.currency };
    },
    verifyWebhookSignature: (_body, signature) => signature === GOOD_SIG,
  };
  return { client, orders };
}

function fakePayments() {
  const payments = new Map<string, PaymentRecord>();
  const subscriptions = new Map<string, { plan: string; expiresAt: Date }>();
  let loseNextRace = false;
  const repo: PaymentRepository = {
    async createOrderRecord(data) {
      payments.set(data.razorpayOrderId, {
        ...data,
        status: "CREATED",
        razorpayPaymentId: null,
      });
    },
    async findByOrderId(orderId) {
      const p = payments.get(orderId);
      return p ? { ...p } : null;
    },
    async captureAndActivate({ orderId, paymentId, userId, plan, expiresAt }) {
      if (loseNextRace) {
        loseNextRace = false;
        return false;
      }
      const p = payments.get(orderId);
      if (!p || p.status === "CAPTURED") return false;
      p.status = "CAPTURED";
      p.razorpayPaymentId = paymentId;
      const current = subscriptions.get(userId);
      subscriptions.set(userId, { plan, expiresAt: expiresAt(current?.expiresAt ?? null) });
      return true;
    },
    async markFailed(orderId) {
      const p = payments.get(orderId);
      if (p?.status === "CREATED") p.status = "FAILED";
    },
  };
  return {
    repo,
    payments,
    subscriptions,
    /** The next capture behaves as if a concurrent delivery got there first. */
    loseNextRace: () => (loseNextRace = true),
  };
}

function event(name: string, entity: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      event: name,
      payload: {
        payment: {
          entity: {
            id: "pay_1",
            order_id: ORDER,
            amount: PRO_MONTHLY.amountPaise,
            currency: "INR",
            ...entity,
          },
        },
      },
    }),
  );
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ status, code });
}

function setup(keyId?: string | null) {
  const razorpay = fakeRazorpay(keyId);
  const db = fakePayments();
  return { ...razorpay, ...db, service: createPaymentService(razorpay.client, db.repo, now) };
}

beforeEach(() => {
  clock = new Date("2026-09-24T12:00:00Z");
});

describe("createOrder", () => {
  test("creates a Razorpay order and stores a CREATED payment", async () => {
    const { service, orders, payments } = setup();
    await expect(service.createOrder(USER)).resolves.toEqual({
      orderId: ORDER,
      amountPaise: PRO_MONTHLY.amountPaise,
      currency: "INR",
      keyId: "rzp_test_key",
    });
    expect(orders).toMatchObject([
      { amountPaise: PRO_MONTHLY.amountPaise, notes: { userId: USER, plan: "pro_monthly" } },
    ]);
    expect(payments.get(ORDER)).toMatchObject({
      userId: USER,
      status: "CREATED",
      amountPaise: PRO_MONTHLY.amountPaise,
    });
  });

  test("without keys it's 503", async () => {
    const { service } = setup(null);
    await expectAppError(service.createOrder(USER), 503, "PAYMENTS_NOT_CONFIGURED");
  });
});

describe("handleWebhook", () => {
  test("a bad or missing signature is 400 and changes nothing", async () => {
    const { service, subscriptions } = setup();
    await service.createOrder(USER);
    await expectAppError(
      service.handleWebhook(event("payment.captured"), "forged"),
      400,
      "INVALID_SIGNATURE",
    );
    await expectAppError(
      service.handleWebhook(event("payment.captured"), undefined),
      400,
      "INVALID_SIGNATURE",
    );
    expect(subscriptions.size).toBe(0);
  });

  test("payment.captured activates Pro for 30 days", async () => {
    const { service, payments, subscriptions } = setup();
    await service.createOrder(USER);
    const outcome = await service.handleWebhook(event("payment.captured"), GOOD_SIG);
    const expiresAt = new Date(clock.getTime() + 30 * DAY_MS);
    expect(outcome).toEqual({ result: "activated", orderId: ORDER, userId: USER, expiresAt });
    expect(payments.get(ORDER)).toMatchObject({ status: "CAPTURED", razorpayPaymentId: "pay_1" });
    expect(subscriptions.get(USER)).toEqual({ plan: "pro_monthly", expiresAt });
  });

  test("a second delivery is a no-op", async () => {
    const { service, subscriptions } = setup();
    await service.createOrder(USER);
    await service.handleWebhook(event("payment.captured"), GOOD_SIG);
    const first = subscriptions.get(USER)!.expiresAt;

    clock = new Date(clock.getTime() + DAY_MS);
    await expect(service.handleWebhook(event("payment.captured"), GOOD_SIG)).resolves.toEqual({
      result: "duplicate",
      orderId: ORDER,
    });
    expect(subscriptions.get(USER)!.expiresAt).toEqual(first);
  });

  test("losing a race to a concurrent delivery counts as a duplicate", async () => {
    const { service, loseNextRace, subscriptions } = setup();
    await service.createOrder(USER);
    loseNextRace();
    await expect(service.handleWebhook(event("payment.captured"), GOOD_SIG)).resolves.toEqual({
      result: "duplicate",
      orderId: ORDER,
    });
    expect(subscriptions.size).toBe(0);
  });

  test("an amount mismatch doesn't activate", async () => {
    const { service, payments, subscriptions } = setup();
    await service.createOrder(USER);
    const outcome = await service.handleWebhook(
      event("payment.captured", { amount: 100 }),
      GOOD_SIG,
    );
    expect(outcome).toMatchObject({ result: "amount_mismatch", orderId: ORDER });
    expect(payments.get(ORDER)!.status).toBe("CREATED");
    expect(subscriptions.size).toBe(0);
  });

  test("an unknown order is acknowledged and ignored", async () => {
    const { service } = setup();
    await expect(
      service.handleWebhook(event("payment.captured", { order_id: "order_nope" }), GOOD_SIG),
    ).resolves.toEqual({ result: "unknown_order", orderId: "order_nope" });
  });

  test("other events are ignored", async () => {
    const { service } = setup();
    await expect(service.handleWebhook(event("order.paid"), GOOD_SIG)).resolves.toEqual({
      result: "ignored",
      event: "order.paid",
    });
  });

  test("payment.failed marks the payment FAILED; a later capture still activates", async () => {
    const { service, payments, subscriptions } = setup();
    await service.createOrder(USER);
    await service.handleWebhook(event("payment.failed", { id: "pay_0" }), GOOD_SIG);
    expect(payments.get(ORDER)!.status).toBe("FAILED");
    expect(subscriptions.size).toBe(0);

    await service.handleWebhook(event("payment.captured"), GOOD_SIG);
    expect(payments.get(ORDER)!.status).toBe("CAPTURED");
    expect(subscriptions.has(USER)).toBe(true);
  });

  test("a signed but malformed body is 400", async () => {
    const { service } = setup();
    await expectAppError(
      service.handleWebhook(Buffer.from("not json"), GOOD_SIG),
      400,
      "INVALID_PAYLOAD",
    );
    await expectAppError(
      service.handleWebhook(Buffer.from('{"event":"payment.captured"}'), GOOD_SIG),
      400,
      "INVALID_PAYLOAD",
    );
  });
});

describe("extendExpiry", () => {
  const t = new Date("2026-09-24T00:00:00Z");

  test("no subscription: 30 days from now", () => {
    expect(extendExpiry(null, t)).toEqual(new Date(t.getTime() + 30 * DAY_MS));
  });

  test("still active: stacks on the current expiry", () => {
    const current = new Date(t.getTime() + 10 * DAY_MS);
    expect(extendExpiry(current, t)).toEqual(new Date(t.getTime() + 40 * DAY_MS));
  });

  test("already expired: 30 days from now", () => {
    const current = new Date(t.getTime() - 10 * DAY_MS);
    expect(extendExpiry(current, t)).toEqual(new Date(t.getTime() + 30 * DAY_MS));
  });
});
