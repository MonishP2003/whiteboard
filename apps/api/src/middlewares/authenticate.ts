import type { FastifyRequest } from "fastify";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken, type TokenPayload } from "../utils/crypto.js";

export const ACCESS_TOKEN_COOKIE = "access_token";

export type AuthUser = TokenPayload;

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `authenticate`; undefined on public routes. */
    user?: AuthUser;
  }
}

export async function authenticate(req: FastifyRequest) {
  const token = req.cookies[ACCESS_TOKEN_COOKIE];
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) throw new AppError(401, "UNAUTHORIZED");
  req.user = user;
}

/** For controllers behind `authenticate`. */
export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED");
  return req.user;
}
