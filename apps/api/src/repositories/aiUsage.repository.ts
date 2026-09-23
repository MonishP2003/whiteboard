import { prisma } from "../config/prisma.js";

export type AiKind = "diagram" | "chart";

export const aiUsageRepository = {
  async record(data: { userId: string; kind: AiKind; success: boolean }): Promise<void> {
    await prisma.aiUsage.create({ data });
  },

  /** Rows for the user created at or after `since` (every attempt, successful or not). */
  countSince(userId: string, since: Date): Promise<number> {
    return prisma.aiUsage.count({ where: { userId, createdAt: { gte: since } } });
  },
};

export type AiUsageRepository = typeof aiUsageRepository;
