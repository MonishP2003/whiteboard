import type { FastifyInstance } from "fastify";
import { paymentController } from "../controllers/payment.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { useRawJsonBody } from "../middlewares/rawBody.js";

export async function paymentRoutes(app: FastifyInstance) {
  app.post("/payments/order", { preHandler: [authenticate] }, paymentController.createOrder);

  // Its own encapsulated plugin, so only the webhook gets the raw-body parser.
  await app.register(async (webhook) => {
    useRawJsonBody(webhook);
    webhook.post("/payments/webhook", paymentController.webhook);
  });
}
