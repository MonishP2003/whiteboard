import type { FastifyRequest } from "fastify";
import { aiService } from "../services/ai.service.js";
import { currentUser } from "./authenticate.js";

/** Per-user AI quota (see `AI_QUOTA`). Runs after `authenticate`. */
export async function rateLimit(req: FastifyRequest) {
  await aiService.checkQuota(currentUser(req).id);
}
