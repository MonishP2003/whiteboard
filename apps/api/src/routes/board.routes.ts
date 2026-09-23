import type { FastifyInstance } from "fastify";
import {
  BoardIdParamsSchema,
  CreateBoardBodySchema,
  SaveBoardBodySchema,
  type BoardIdParams,
  type CreateBoardBody,
  type SaveBoardBody,
} from "@whiteboard/shared";
import { boardController } from "../controllers/board.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";

/** Whole scenes can carry image data URLs (AI charts), so saves get a larger limit. */
const SAVE_BODY_LIMIT = 2 * 1024 * 1024;

export async function boardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  const params = validate({ params: BoardIdParamsSchema });

  app.get("/boards", boardController.list);
  app.post<{ Body: CreateBoardBody }>(
    "/boards",
    { preHandler: [validate({ body: CreateBoardBodySchema })] },
    boardController.create,
  );
  app.get<{ Params: BoardIdParams }>("/boards/:id", { preHandler: [params] }, boardController.get);
  app.put<{ Params: BoardIdParams; Body: SaveBoardBody }>(
    "/boards/:id",
    {
      bodyLimit: SAVE_BODY_LIMIT,
      preHandler: [validate({ params: BoardIdParamsSchema, body: SaveBoardBodySchema })],
    },
    boardController.save,
  );
  app.delete<{ Params: BoardIdParams }>(
    "/boards/:id",
    { preHandler: [params] },
    boardController.delete,
  );
}
