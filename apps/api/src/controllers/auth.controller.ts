import type { FastifyReply, FastifyRequest } from "fastify";
import type { LoginBody, RegisterBody } from "@whiteboard/shared";
import { env } from "../config/env.js";
import { ACCESS_TOKEN_COOKIE, currentUser } from "../middlewares/authenticate.js";
import { authService, type AuthResult } from "../services/auth.service.js";
import { ACCESS_TOKEN_TTL_SECONDS } from "../utils/crypto.js";

const cookieOptions = {
  httpOnly: true,
  // Browsers may drop Secure cookies on plain http://localhost.
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

function sendAuth(reply: FastifyReply, status: number, { user, token }: AuthResult) {
  return reply
    .setCookie(ACCESS_TOKEN_COOKIE, token, { ...cookieOptions, maxAge: ACCESS_TOKEN_TTL_SECONDS })
    .code(status)
    .send(user);
}

export const authController = {
  async register(req: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) {
    return sendAuth(reply, 201, await authService.register(req.body));
  },

  async login(req: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
    return sendAuth(reply, 200, await authService.login(req.body));
  },

  async logout(_req: FastifyRequest, reply: FastifyReply) {
    return reply.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions).code(204).send();
  },

  async me(req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await authService.me(currentUser(req).id));
  },
};
