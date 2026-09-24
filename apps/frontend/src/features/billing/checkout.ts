import type { CreateOrderResponse } from "@whiteboard/shared";
import { loadScript } from "@/lib/loadScript";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// The subset of Razorpay Checkout's options we use.
interface CheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { email?: string; name?: string };
  theme?: { color?: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string }) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open(): void };
  }
}

/**
 * Opens Razorpay Checkout for an order. Resolves "paid" from the success callback (which
 * proves nothing: only the server's webhook grants access) or "dismissed" if closed.
 */
export async function openCheckout(
  order: CreateOrderResponse,
  prefill: { email?: string; name?: string },
): Promise<"paid" | "dismissed"> {
  await loadScript(CHECKOUT_SRC);
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay Checkout didn't load");

  return new Promise((resolve) => {
    new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "Whiteboard",
      description: "Pro · 30 days",
      prefill,
      theme: { color: "#2563eb" },
      handler: () => resolve("paid"),
      modal: { ondismiss: () => resolve("dismissed") },
    }).open();
  });
}
