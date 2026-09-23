import type { FastifyReply, FastifyRequest } from "fastify";
import type { BoardIdParams, CreateBoardBody, SaveBoardBody } from "@whiteboard/shared";
import { currentUser } from "../middlewares/authenticate.js";
import { boardService } from "../services/board.service.js";

export const boardController = {
  async list(req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await boardService.listForUser(currentUser(req).id));
  },

  async create(req: FastifyRequest<{ Body: CreateBoardBody }>, reply: FastifyReply) {
    return reply.code(201).send(await boardService.create(currentUser(req).id, req.body));
  },

  async get(req: FastifyRequest<{ Params: BoardIdParams }>, reply: FastifyReply) {
    return reply.send(await boardService.getOwned(currentUser(req).id, req.params.id));
  },

  async save(
    req: FastifyRequest<{ Params: BoardIdParams; Body: SaveBoardBody }>,
    reply: FastifyReply,
  ) {
    return reply.send(await boardService.save(currentUser(req).id, req.params.id, req.body));
  },

  async delete(req: FastifyRequest<{ Params: BoardIdParams }>, reply: FastifyReply) {
    await boardService.delete(currentUser(req).id, req.params.id);
    return reply.code(204).send();
  },
};
