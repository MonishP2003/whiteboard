import type { LoginBody, MeResponse, RegisterBody } from "@whiteboard/shared";
import {
  userRepository,
  type UserRecord,
  type UserRepository,
} from "../repositories/user.repository.js";
import { AppError } from "../utils/AppError.js";
import { isSubscriptionActive } from "./subscription.service.js";
import { hashPassword, signAccessToken, verifyPassword } from "../utils/crypto.js";

export interface AuthResult {
  user: MeResponse;
  token: string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function toMeResponse(user: UserRecord, now = new Date()): MeResponse {
  const sub = user.subscription;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    subscription: sub && {
      // Expiry is checked at read time, so an overdue ACTIVE row reads as EXPIRED.
      status: sub.status === "ACTIVE" && !isSubscriptionActive(sub, now) ? "EXPIRED" : sub.status,
      expiresAt: sub.expiresAt.toISOString(),
    },
  };
}

export function createAuthService(users: UserRepository) {
  // Verified against when the email is unknown, so both failure paths take about as long.
  let dummyHash: Promise<string> | undefined;

  async function issue(user: UserRecord): Promise<AuthResult> {
    const token = await signAccessToken({ id: user.id, email: user.email });
    return { user: toMeResponse(user), token };
  }

  return {
    async register(body: RegisterBody): Promise<AuthResult> {
      const email = normalizeEmail(body.email);
      if (await users.findByEmail(email)) throw new AppError(409, "EMAIL_TAKEN");

      const user = await users.create({
        email,
        name: body.name.trim(),
        passwordHash: await hashPassword(body.password),
      });
      if (!user) throw new AppError(409, "EMAIL_TAKEN");
      return issue(user);
    },

    async login(body: LoginBody): Promise<AuthResult> {
      const user = await users.findByEmail(normalizeEmail(body.email));
      if (!user) {
        dummyHash ??= hashPassword("not-a-real-password");
        await verifyPassword(await dummyHash, body.password);
        throw new AppError(401, "INVALID_CREDENTIALS");
      }
      if (!(await verifyPassword(user.passwordHash, body.password))) {
        throw new AppError(401, "INVALID_CREDENTIALS");
      }
      return issue(user);
    },

    async me(userId: string): Promise<MeResponse> {
      const user = await users.findById(userId);
      // A valid token for a deleted user.
      if (!user) throw new AppError(401, "UNAUTHORIZED");
      return toMeResponse(user);
    },
  };
}

export const authService = createAuthService(userRepository);
