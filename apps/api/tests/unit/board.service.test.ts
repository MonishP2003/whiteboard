import { beforeEach, describe, expect, test } from "vitest";
import { emptyScene, type Scene } from "@whiteboard/shared";
import type { BoardRecord, BoardRepository } from "../../src/repositories/board.repository.js";
import { createBoardService, DEFAULT_BOARD_TITLE } from "../../src/services/board.service.js";
import { AppError } from "../../src/utils/AppError.js";

const ALICE = "alice";
const BOB = "bob";

function fakeRepo() {
  const rows = new Map<string, BoardRecord>();
  let seq = 0;
  const repo: BoardRepository = {
    async listByOwner(ownerId) {
      return [...rows.values()]
        .filter((b) => b.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async create(data) {
      const row = { id: `b${++seq}`, updatedAt: new Date(seq * 1000), ...data };
      rows.set(row.id, row);
      return row;
    },
    async updateScene(id, data) {
      const row = rows.get(id)!;
      Object.assign(
        row,
        Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
      );
      row.updatedAt = new Date(++seq * 1000);
      return row;
    },
    async delete(id) {
      rows.delete(id);
    },
  };
  return { repo, rows };
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ status, code });
}

let repo: BoardRepository;
let rows: Map<string, BoardRecord>;
let service: ReturnType<typeof createBoardService>;

beforeEach(() => {
  ({ repo, rows } = fakeRepo());
  service = createBoardService(repo);
});

describe("create", () => {
  test("defaults title and scene", async () => {
    const board = await service.create(ALICE, {});
    expect(board.title).toBe(DEFAULT_BOARD_TITLE);
    expect(board.scene).toEqual(emptyScene());
    expect(rows.get(board.id)?.ownerId).toBe(ALICE);
  });
});

describe("listForUser", () => {
  test("returns only the user's boards, newest first, as ISO dates", async () => {
    await service.create(ALICE, { title: "old" });
    await service.create(BOB, { title: "bob's" });
    await service.create(ALICE, { title: "new" });
    const list = await service.listForUser(ALICE);
    expect(list.map((b) => b.title)).toEqual(["new", "old"]);
    expect(typeof list[0]!.updatedAt).toBe("string");
  });
});

describe("ownership", () => {
  test("owner can get, save and delete", async () => {
    const { id } = await service.create(ALICE, {});
    const scene: Scene = emptyScene();
    await expect(service.getOwned(ALICE, id)).resolves.toMatchObject({ id });
    await expect(service.save(ALICE, id, { title: "Renamed", scene })).resolves.toMatchObject({
      title: "Renamed",
    });
    await service.delete(ALICE, id);
    expect(rows.has(id)).toBe(false);
  });

  test("another user's board is 404, same as a missing one", async () => {
    const { id } = await service.create(ALICE, { title: "secret" });
    await expectAppError(service.getOwned(BOB, id), 404, "BOARD_NOT_FOUND");
    await expectAppError(service.save(BOB, id, { title: "pwned" }), 404, "BOARD_NOT_FOUND");
    await expectAppError(service.delete(BOB, id), 404, "BOARD_NOT_FOUND");
    await expectAppError(service.getOwned(ALICE, "missing"), 404, "BOARD_NOT_FOUND");
    expect(rows.get(id)?.title).toBe("secret");
  });
});
