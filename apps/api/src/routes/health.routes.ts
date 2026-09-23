import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@whiteboard/shared";
import { pingDatabase } from "../repositories/health.repository.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    const ok = await pingDatabase();
    const body: HealthResponse = { status: ok ? "ok" : "db_unavailable" };
    return reply.code(ok ? 200 : 503).send(body);
  });
}
