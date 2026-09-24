import type { FastifyInstance } from "fastify";
import {
  LoginBodySchema,
  RegisterBodySchema,
  type LoginBody,
  type RegisterBody,
} from "@whiteboard/shared";
import { authController } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";

/** Per client IP and per route: slows password guessing and account spam. */
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>(
    "/auth/register",
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: [validate({ body: RegisterBodySchema })],
    },
    authController.register,
  );
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: [validate({ body: LoginBodySchema })],
    },
    authController.login,
  );
  app.post("/auth/logout", authController.logout);
  app.get("/me", { preHandler: [authenticate] }, authController.me);
}
