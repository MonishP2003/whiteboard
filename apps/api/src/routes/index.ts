import type { FastifyInstance } from "fastify";
import { aiRoutes } from "./ai.routes.js";
import { authRoutes } from "./auth.routes.js";
import { boardRoutes } from "./board.routes.js";
import { healthRoutes } from "./health.routes.js";
import { paymentRoutes } from "./payment.routes.js";

export async function routes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(boardRoutes);
  await app.register(aiRoutes);
  await app.register(paymentRoutes);
}
