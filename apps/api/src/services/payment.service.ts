import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PRO_MONTHLY, type CreateOrderResponse } from "@whiteboard/shared";
import { razorpayClient, type RazorpayClient } from "../integrations/razorpay.client.js";
import { paymentRepository, type PaymentRepository } from "../repositories/payment.repository.js";
import { AppError } from "../utils/AppError.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The parts of a Razorpay `payment.*` webhook we read. */
const PaymentEventSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        order_id: z.string(),
        amount: z.number().int(),
        currency: z.string(),
      }),
    }),
  }),
});

/**
 * What a verified webhook did. Everything but a bad signature or body is acknowledged with
 * 200, so Razorpay doesn't keep retrying deliveries that can never succeed.
 */
export type WebhookOutcome =
  | { result: "activated"; orderId: string; userId: string; expiresAt: Date }
  | { result: "duplicate"; orderId: string }
  | { result: "failed_recorded"; orderId: string }
  | { result: "ignored"; event: string }
  | { result: "unknown_order"; orderId: string }
  | { result: "amount_mismatch"; orderId: string; expected: string; received: string };

/** Paid time stacks: a renewal starts from the current expiry if that's still ahead. */
export function extendExpiry(current: Date | null, now: Date, days = PRO_MONTHLY.days): Date {
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + days * DAY_MS);
}

export function createPaymentService(
  razorpay: RazorpayClient,
  payments: PaymentRepository,
  now: () => Date = () => new Date(),
) {
  return {
    async createOrder(userId: string): Promise<CreateOrderResponse> {
      if (!razorpay.keyId) throw new AppError(503, "PAYMENTS_NOT_CONFIGURED");
      const { plan, amountPaise, currency } = PRO_MONTHLY;
      // Our payment id doubles as Razorpay's receipt (max 40 chars; a UUID is 36).
      const id = randomUUID();
      const order = await razorpay.createOrder({
        amountPaise,
        currency,
        receipt: id,
        notes: { userId, plan },
      });
      await payments.createOrderRecord({
        id,
        userId,
        plan,
        amountPaise,
        currency,
        razorpayOrderId: order.id,
      });
      return { orderId: order.id, amountPaise, currency, keyId: razorpay.keyId };
    },

    /** Grants access. Only a verified `payment.captured` event does; the browser never can. */
    async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookOutcome> {
      if (!signature || !razorpay.verifyWebhookSignature(rawBody, signature)) {
        throw new AppError(400, "INVALID_SIGNATURE");
      }

      let json: unknown;
      try {
        json = JSON.parse(rawBody.toString("utf8"));
      } catch {
        throw new AppError(400, "INVALID_PAYLOAD");
      }
      const event = (json as { event?: unknown } | null)?.event;
      if (event !== "payment.captured" && event !== "payment.failed") {
        return { result: "ignored", event: String(event) };
      }
      const parsed = PaymentEventSchema.safeParse(json);
      if (!parsed.success) throw new AppError(400, "INVALID_PAYLOAD");
      const entity = parsed.data.payload.payment.entity;
      const orderId = entity.order_id;

      const payment = await payments.findByOrderId(orderId);
      if (!payment) return { result: "unknown_order", orderId };

      if (event === "payment.failed") {
        await payments.markFailed(orderId);
        return { result: "failed_recorded", orderId };
      }

      if (entity.amount !== payment.amountPaise || entity.currency !== payment.currency) {
        return {
          result: "amount_mismatch",
          orderId,
          expected: `${payment.amountPaise} ${payment.currency}`,
          received: `${entity.amount} ${entity.currency}`,
        };
      }

      if (payment.status === "CAPTURED") return { result: "duplicate", orderId };

      let expiresAt: Date | undefined;
      const activated = await payments.captureAndActivate({
        orderId,
        paymentId: entity.id,
        userId: payment.userId,
        plan: payment.plan,
        expiresAt: (current) => (expiresAt = extendExpiry(current, now())),
      });
      if (!activated || !expiresAt) return { result: "duplicate", orderId };
      return { result: "activated", orderId, userId: payment.userId, expiresAt };
    },
  };
}

export const paymentService = createPaymentService(razorpayClient, paymentRepository);
