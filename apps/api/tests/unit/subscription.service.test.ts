import { describe, expect, test } from "vitest";
import type { SubscriptionRecord } from "../../src/repositories/user.repository.js";
import {
  createSubscriptionService,
  isSubscriptionActive,
} from "../../src/services/subscription.service.js";

const now = new Date("2026-09-24T12:00:00Z");
const later = new Date(now.getTime() + 1000);
const earlier = new Date(now.getTime() - 1000);

describe("isSubscriptionActive", () => {
  test.each<[string, SubscriptionRecord | null, boolean]>([
    ["no subscription", null, false],
    ["ACTIVE, not yet expired", { status: "ACTIVE", expiresAt: later }, true],
    ["ACTIVE but past expiresAt", { status: "ACTIVE", expiresAt: earlier }, false],
    ["ACTIVE, expiring exactly now", { status: "ACTIVE", expiresAt: now }, false],
    ["CANCELLED", { status: "CANCELLED", expiresAt: later }, false],
    ["EXPIRED", { status: "EXPIRED", expiresAt: later }, false],
  ])("%s", (_name, sub, expected) => {
    expect(isSubscriptionActive(sub, now)).toBe(expected);
  });
});

test("isActive reads the user's subscription", async () => {
  const service = createSubscriptionService(
    {
      findByUserId: async (userId) =>
        userId === "pro" ? { status: "ACTIVE", expiresAt: later } : null,
    },
    () => now,
  );
  await expect(service.isActive("pro")).resolves.toBe(true);
  await expect(service.isActive("free")).resolves.toBe(false);
});
