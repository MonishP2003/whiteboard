import {
  subscriptionRepository,
  type SubscriptionRepository,
} from "../repositories/subscription.repository.js";
import type { SubscriptionRecord } from "../repositories/user.repository.js";

/** Expiry is checked at read time, so no job has to flip overdue rows to EXPIRED. */
export function isSubscriptionActive(sub: SubscriptionRecord | null, now = new Date()): boolean {
  return sub?.status === "ACTIVE" && sub.expiresAt > now;
}

export function createSubscriptionService(
  subscriptions: SubscriptionRepository,
  now: () => Date = () => new Date(),
) {
  return {
    async isActive(userId: string): Promise<boolean> {
      return isSubscriptionActive(await subscriptions.findByUserId(userId), now());
    },
  };
}

export const subscriptionService = createSubscriptionService(subscriptionRepository);
