import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { routes } from "./routes/index.js";
import { AppError } from "./utils/AppError.js";

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    // Trust the nearest N hops of X-Forwarded-For (Caddy, CloudFront); 0 trusts none.
    trustProxy: (_address, hop) => hop < env.TRUST_PROXY_HOPS,
  });
  await app.register(helmet);
  // Off by default; routes opt in with `config.rateLimit` (see auth.routes.ts).
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new AppError(429, "RATE_LIMITED"),
  });
  await app.register(cookie);
  app.setErrorHandler(errorHandler);
  await app.register(routes, { prefix: "/api" });
  return app;
}
