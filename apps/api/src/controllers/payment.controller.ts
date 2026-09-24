import type { FastifyReply, FastifyRequest } from "fastify";
import { currentUser } from "../middlewares/authenticate.js";
import { paymentService } from "../services/payment.service.js";
import { AppError } from "../utils/AppError.js";

export const SIGNATURE_HEADER = "x-razorpay-signature";

export const paymentController = {
  async createOrder(req: FastifyRequest, reply: FastifyReply) {
    return reply.code(201).send(await paymentService.createOrder(currentUser(req).id));
  },

  /** The body is the raw Buffer (see `useRawJsonBody`); the signature is the auth. */
  async webhook(req: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
    if (!Buffer.isBuffer(req.body)) throw new AppError(400, "INVALID_PAYLOAD");
    const signature = req.headers[SIGNATURE_HEADER];
    const outcome = await paymentService.handleWebhook(
      req.body,
      typeof signature === "string" ? signature : undefined,
    );
    if (outcome.result === "amount_mismatch" || outcome.result === "unknown_order") {
      req.log.error({ webhook: outcome }, "razorpay webhook not applied");
    } else {
      req.log.info({ webhook: outcome }, "razorpay webhook");
    }
    return reply.send({ ok: true });
  },
};
