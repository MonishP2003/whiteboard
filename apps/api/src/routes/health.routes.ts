import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@whiteboard/shared";
import { env } from "../config/env.js";
import { pingDatabase } from "../repositories/health.repository.js";

export async function healthRoutes(app: FastifyInstance) {
  // deploy.yml polls this through CloudFront and rolls back unless it returns 200 with the
  // new image tag as `version`.
  app.get("/health", async (_req, reply) => {
    const ok = await pingDatabase();
    const body: HealthResponse = {
      status: ok ? "ok" : "db_unavailable",
      version: env.APP_VERSION,
    };
    return reply.code(ok ? 200 : 503).send(body);
  });
}
