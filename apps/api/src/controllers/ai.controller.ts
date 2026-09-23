import type { FastifyReply, FastifyRequest } from "fastify";
import type { ChartRequest, DiagramRequest } from "@whiteboard/shared";
import { currentUser } from "../middlewares/authenticate.js";
import { aiService } from "../services/ai.service.js";

export const aiController = {
  async diagram(req: FastifyRequest<{ Body: DiagramRequest }>, reply: FastifyReply) {
    return reply.send(await aiService.generateDiagram(currentUser(req).id, req.body.prompt));
  },

  async chart(req: FastifyRequest<{ Body: ChartRequest }>, reply: FastifyReply) {
    return reply.send(await aiService.generateChart(currentUser(req).id, req.body.prompt));
  },
};
