import { prisma } from "../config/prisma.js";
import type { SubscriptionRecord } from "./user.repository.js";

export const subscriptionRepository = {
  findByUserId(userId: string): Promise<SubscriptionRecord | null> {
    return prisma.subscription.findUnique({
      where: { userId },
      select: { status: true, expiresAt: true },
    });
  },
};

export type SubscriptionRepository = typeof subscriptionRepository;
