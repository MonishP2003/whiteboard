import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export type PaymentStatus = "CREATED" | "CAPTURED" | "FAILED";

export interface PaymentRecord {
  id: string;
  userId: string;
  plan: string;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
}

export interface CaptureInput {
  orderId: string;
  paymentId: string;
  userId: string;
  plan: string;
  /** Given the current subscription's expiry (if any), returns the new one. */
  expiresAt: (current: Date | null) => Date;
}

export const paymentRepository = {
  async createOrderRecord(data: {
    id: string;
    userId: string;
    plan: string;
    amountPaise: number;
    currency: string;
    razorpayOrderId: string;
  }): Promise<void> {
    await prisma.payment.create({ data });
  },

  findByOrderId(razorpayOrderId: string): Promise<PaymentRecord | null> {
    return prisma.payment.findUnique({ where: { razorpayOrderId } });
  },

  /**
   * Marks the payment CAPTURED and extends the user's subscription, in one transaction.
   * Returns false, changing nothing, if the payment was already captured. A concurrent
   * duplicate waits on the payment row's lock and then matches no rows; the unique
   * razorpayPaymentId turns any other race into a P2002, treated the same way.
   */
  async captureAndActivate({
    orderId,
    paymentId,
    userId,
    plan,
    expiresAt,
  }: CaptureInput): Promise<boolean> {
    try {
      return await prisma.$transaction(async (tx) => {
        const { count } = await tx.payment.updateMany({
          where: { razorpayOrderId: orderId, status: { not: "CAPTURED" } },
          data: { status: "CAPTURED", razorpayPaymentId: paymentId },
        });
        if (count === 0) return false;

        const current = await tx.subscription.findUnique({
          where: { userId },
          select: { expiresAt: true },
        });
        const next = expiresAt(current?.expiresAt ?? null);
        await tx.subscription.upsert({
          where: { userId },
          create: { userId, plan, status: "ACTIVE", expiresAt: next },
          update: { plan, status: "ACTIVE", expiresAt: next },
        });
        return true;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return false;
      }
      throw err;
    }
  },

  /** A failed attempt. Checkout lets the user retry on the same order, so a later capture still wins. */
  async markFailed(orderId: string): Promise<void> {
    await prisma.payment.updateMany({
      where: { razorpayOrderId: orderId, status: "CREATED" },
      data: { status: "FAILED" },
    });
  },
};

export type PaymentRepository = typeof paymentRepository;
