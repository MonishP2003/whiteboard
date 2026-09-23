import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export interface SubscriptionRecord {
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  expiresAt: Date;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  subscription: SubscriptionRecord | null;
}

const select = {
  id: true,
  email: true,
  name: true,
  passwordHash: true,
  subscription: { select: { status: true, expiresAt: true } },
} satisfies Prisma.UserSelect;

export const userRepository = {
  findByEmail(email: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { email }, select });
  },

  findById(id: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id }, select });
  },

  /** Returns null if the email is already taken (unique violation). */
  async create(data: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<UserRecord | null> {
    try {
      return await prisma.user.create({ data, select });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    }
  },
};

export type UserRepository = typeof userRepository;
