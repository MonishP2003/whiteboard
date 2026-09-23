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

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterBody }>(
    "/auth/register",
    { preHandler: [validate({ body: RegisterBodySchema })] },
    authController.register,
  );
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    { preHandler: [validate({ body: LoginBodySchema })] },
    authController.login,
  );
  app.post("/auth/logout", authController.logout);
  app.get("/me", { preHandler: [authenticate] }, authController.me);
}
