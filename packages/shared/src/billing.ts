import { z } from "zod";

/** The one paid plan. Amounts are always integer paise (₹1 = 100 paise). */
export const PRO_MONTHLY = {
  plan: "pro_monthly",
  amountPaise: 19900,
  currency: "INR",
  days: 30,
} as const;

export const CreateOrderResponseSchema = z.object({
  /** Razorpay order id, passed to Checkout as `order_id`. */
  orderId: z.string(),
  amountPaise: z.number().int().positive(),
  currency: z.string(),
  /** Public Razorpay key id for Checkout. */
  keyId: z.string(),
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;
