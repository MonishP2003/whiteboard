import type { FastifyRequest } from "fastify";
import { subscriptionService } from "../services/subscription.service.js";
import { AppError } from "../utils/AppError.js";
import { currentUser } from "./authenticate.js";

/** Pro-only routes. Runs after `authenticate`. */
export async function requireSubscription(req: FastifyRequest) {
  if (!(await subscriptionService.isActive(currentUser(req).id))) {
    throw new AppError(402, "SUBSCRIPTION_REQUIRED");
  }
}
