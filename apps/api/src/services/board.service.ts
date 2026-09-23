import {
  emptyScene,
  type BoardDetail,
  type BoardSummary,
  type CreateBoardBody,
  type SaveBoardBody,
} from "@whiteboard/shared";
import {
  boardRepository,
  type BoardRecord,
  type BoardRepository,
  type BoardSummaryRecord,
} from "../repositories/board.repository.js";
import { AppError } from "../utils/AppError.js";

export const DEFAULT_BOARD_TITLE = "Untitled board";

const toSummary = (b: BoardSummaryRecord): BoardSummary => ({
  id: b.id,
  title: b.title,
  updatedAt: b.updatedAt.toISOString(),
});

const toDetail = (b: BoardRecord): BoardDetail => ({ ...toSummary(b), scene: b.scene });

export function createBoardService(boards: BoardRepository) {
  /**
   * Other users' boards get the same 404 as missing ones, so board IDs can't be probed.
   */
  async function getOwnedRecord(userId: string, boardId: string): Promise<BoardRecord> {
    const board = await boards.findById(boardId);
    if (!board || board.ownerId !== userId) throw new AppError(404, "BOARD_NOT_FOUND");
    return board;
  }

  return {
    async listForUser(userId: string): Promise<BoardSummary[]> {
      return (await boards.listByOwner(userId)).map(toSummary);
    },

    async create(userId: string, body: CreateBoardBody): Promise<BoardDetail> {
      const board = await boards.create({
        ownerId: userId,
        title: body.title ?? DEFAULT_BOARD_TITLE,
        scene: body.scene ?? emptyScene(),
      });
      return toDetail(board);
    },

    async getOwned(userId: string, boardId: string): Promise<BoardDetail> {
      return toDetail(await getOwnedRecord(userId, boardId));
    },

    async save(userId: string, boardId: string, body: SaveBoardBody): Promise<BoardSummary> {
      await getOwnedRecord(userId, boardId);
      return toSummary(await boards.updateScene(boardId, body));
    },

    async delete(userId: string, boardId: string): Promise<void> {
      await getOwnedRecord(userId, boardId);
      await boards.delete(boardId);
    },
  };
}

export const boardService = createBoardService(boardRepository);
