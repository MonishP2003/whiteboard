import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export function errorHandler(
  error: FastifyError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    if (error.status >= 500) req.log.error(error);
    return reply
      .code(error.status)
      .send(
        error.details === undefined
          ? { error: error.code }
          : { error: error.code, details: error.details },
      );
  }
  if (error instanceof ZodError || ("validation" in error && error.validation)) {
    return reply.code(400).send({ error: "VALIDATION" });
  }
  // Fastify's own client errors: body too large, malformed JSON, etc.
  if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ error: error.code ?? "BAD_REQUEST" });
  }
  req.log.error(error);
  return reply.code(500).send({ error: "INTERNAL" });
}
