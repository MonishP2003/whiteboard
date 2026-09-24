import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export interface CreateOrderInput {
  amountPaise: number;
  currency: string;
  /** Our reference for the order, at most 40 characters. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface RazorpayClient {
  /** Public key id for Checkout; null when payments aren't configured. */
  keyId: string | null;
  createOrder(input: CreateOrderInput): Promise<RazorpayOrder>;
  /** HMAC-SHA256 of the exact request bytes, compared in constant time. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

export interface RazorpayConfig {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const actual = Buffer.from(signature);
  // timingSafeEqual throws on unequal lengths.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createRazorpayClient({
  keyId,
  keySecret,
  webhookSecret,
}: RazorpayConfig): RazorpayClient {
  const sdk = keyId && keySecret ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null;

  return {
    keyId: sdk ? keyId! : null,

    async createOrder({ amountPaise, currency, receipt, notes }) {
      if (!sdk) throw new AppError(503, "PAYMENTS_NOT_CONFIGURED");
      try {
        const order = await sdk.orders.create({ amount: amountPaise, currency, receipt, notes });
        return { id: order.id, amount: Number(order.amount), currency: order.currency };
      } catch (err) {
        // The SDK rejects with a plain object ({ statusCode, error }), not an Error.
        throw new AppError(502, "PAYMENT_UPSTREAM_ERROR", undefined, { cause: err });
      }
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!webhookSecret) throw new AppError(503, "PAYMENTS_NOT_CONFIGURED");
      return verifySignature(rawBody, signature, webhookSecret);
    },
  };
}

export const razorpayClient = createRazorpayClient({
  keyId: env.RAZORPAY_KEY_ID,
  keySecret: env.RAZORPAY_KEY_SECRET,
  webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
});
