import type { FastifyInstance } from "fastify";

/**
 * Makes JSON request bodies arrive as the raw Buffer, for signature checks that need the
 * exact bytes the sender signed. Call it inside an encapsulated plugin so only that
 * plugin's routes lose the normal JSON parser.
 */
export function useRawJsonBody(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );
}
