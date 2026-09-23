import type { Prisma } from "@prisma/client";
import type { Scene } from "@whiteboard/shared";
import { prisma } from "../config/prisma.js";

export interface BoardSummaryRecord {
  id: string;
  title: string;
  updatedAt: Date;
}

export interface BoardRecord extends BoardSummaryRecord {
  ownerId: string;
  scene: Scene;
}

const summarySelect = { id: true, title: true, updatedAt: true } satisfies Prisma.BoardSelect;
const fullSelect = { ...summarySelect, ownerId: true, scene: true } satisfies Prisma.BoardSelect;

// Scenes are validated with SceneSchema before every write, so reads are cast, not re-parsed.
type BoardRow = Prisma.BoardGetPayload<{ select: typeof fullSelect }>;
const toRecord = (row: BoardRow): BoardRecord => ({ ...row, scene: row.scene as unknown as Scene });
const toJson = (scene: Scene) => scene as unknown as Prisma.InputJsonValue;

export const boardRepository = {
  listByOwner(ownerId: string): Promise<BoardSummaryRecord[]> {
    return prisma.board.findMany({
      where: { ownerId },
      select: summarySelect,
      orderBy: { updatedAt: "desc" },
    });
  },

  async findById(id: string): Promise<BoardRecord | null> {
    const row = await prisma.board.findUnique({ where: { id }, select: fullSelect });
    return row && toRecord(row);
  },

  async create(data: { ownerId: string; title: string; scene: Scene }): Promise<BoardRecord> {
    const row = await prisma.board.create({
      data: { ...data, scene: toJson(data.scene) },
      select: fullSelect,
    });
    return toRecord(row);
  },

  updateScene(id: string, data: { title?: string; scene?: Scene }): Promise<BoardSummaryRecord> {
    return prisma.board.update({
      where: { id },
      data: { title: data.title, scene: data.scene && toJson(data.scene) },
      select: summarySelect,
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.board.delete({ where: { id } });
  },
};

export type BoardRepository = typeof boardRepository;
