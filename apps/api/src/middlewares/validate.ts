import type { preHandlerAsyncHookHandler } from "fastify";
import { ZodError, type ZodTypeAny } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Parses the request with Zod and replaces body/params/query with the parsed values. */
export function validate(schemas: Schemas): preHandlerAsyncHookHandler {
  return async (req) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new AppError(
          400,
          "VALIDATION_FAILED",
          env.NODE_ENV === "development" ? err.issues : undefined,
        );
      }
      throw err;
    }
  };
}
