import { prisma } from "../../src/config/prisma.js";

/** Empties every application table. */
export async function truncateAll() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AiUsage", "Payment", "Subscription", "Board", "User" RESTART IDENTITY CASCADE',
  );
}

export { prisma };
