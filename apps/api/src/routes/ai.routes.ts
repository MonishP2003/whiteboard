import type { FastifyInstance } from "fastify";
import {
  ChartRequestSchema,
  DiagramRequestSchema,
  type ChartRequest,
  type DiagramRequest,
} from "@whiteboard/shared";
import { aiController } from "../controllers/ai.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { requireSubscription } from "../middlewares/requireSubscription.js";
import { validate } from "../middlewares/validate.js";

export async function aiRoutes(app: FastifyInstance) {
  app.post<{ Body: DiagramRequest }>(
    "/ai/diagram",
    {
      preHandler: [
        authenticate,
        requireSubscription,
        rateLimit,
        validate({ body: DiagramRequestSchema }),
      ],
    },
    aiController.diagram,
  );
  app.post<{ Body: ChartRequest }>(
    "/ai/chart",
    {
      preHandler: [
        authenticate,
        requireSubscription,
        rateLimit,
        validate({ body: ChartRequestSchema }),
      ],
    },
    aiController.chart,
  );
}
