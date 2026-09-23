import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { routes } from "./routes/index.js";

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== "test" });
  await app.register(cookie);
  app.setErrorHandler(errorHandler);
  await app.register(routes, { prefix: "/api" });
  return app;
}
