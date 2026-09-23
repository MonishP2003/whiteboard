import { beforeEach, describe, expect, test } from "vitest";
import type { UserRecord, UserRepository } from "../../src/repositories/user.repository.js";
import { createAuthService, toMeResponse } from "../../src/services/auth.service.js";
import { AppError } from "../../src/utils/AppError.js";
import { verifyAccessToken } from "../../src/utils/crypto.js";

function fakeRepo() {
  const rows = new Map<string, UserRecord>();
  const repo: UserRepository = {
    async findByEmail(email) {
      return [...rows.values()].find((u) => u.email === email) ?? null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async create(data) {
      const user = { id: `u${rows.size + 1}`, subscription: null, ...data };
      rows.set(user.id, user);
      return user;
    },
  };
  return { repo, rows };
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ status, code });
}

const body = { email: "  Alice@Example.COM ", password: "correct horse", name: " Alice " };

let rows: Map<string, UserRecord>;
let service: ReturnType<typeof createAuthService>;

beforeEach(() => {
  const fake = fakeRepo();
  rows = fake.rows;
  service = createAuthService(fake.repo);
});

describe("register", () => {
  test("normalizes email, hashes the password and issues a token", async () => {
    const { user, token } = await service.register(body);
    expect(user).toEqual({
      id: "u1",
      email: "alice@example.com",
      name: "Alice",
      subscription: null,
    });
    expect(rows.get("u1")?.passwordHash).not.toContain("correct horse");
    expect(await verifyAccessToken(token)).toEqual({ id: "u1", email: "alice@example.com" });
  });

  test("duplicate email (any case) is 409", async () => {
    await service.register(body);
    await expectAppError(
      service.register({ ...body, email: "ALICE@example.com" }),
      409,
      "EMAIL_TAKEN",
    );
  });
});

describe("login", () => {
  beforeEach(() => service.register(body));

  test("succeeds with the right password, case-insensitive email", async () => {
    const { user } = await service.login({ email: "alice@EXAMPLE.com", password: "correct horse" });
    expect(user.id).toBe("u1");
  });

  test("wrong password and unknown email give the same 401", async () => {
    await expectAppError(
      service.login({ email: body.email, password: "wrong" }),
      401,
      "INVALID_CREDENTIALS",
    );
    await expectAppError(
      service.login({ email: "nobody@example.com", password: "correct horse" }),
      401,
      "INVALID_CREDENTIALS",
    );
  });
});

describe("me", () => {
  test("unknown user is 401", async () => {
    await expectAppError(service.me("gone"), 401, "UNAUTHORIZED");
  });

  test("an ACTIVE subscription past its expiry reads as EXPIRED", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const user = (expiresAt: string): UserRecord => ({
      id: "u1",
      email: "a@b.c",
      name: "A",
      passwordHash: "x",
      subscription: { status: "ACTIVE", expiresAt: new Date(expiresAt) },
    });
    expect(toMeResponse(user("2026-01-09T00:00:00Z"), now).subscription?.status).toBe("EXPIRED");
    expect(toMeResponse(user("2026-01-11T00:00:00Z"), now).subscription).toEqual({
      status: "ACTIVE",
      expiresAt: "2026-01-11T00:00:00.000Z",
    });
  });
});
