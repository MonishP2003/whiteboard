import { afterAll, beforeEach, describe, expect, test } from "vitest";
import type { BoardDetail, BoardSummary, MeResponse, Scene } from "@whiteboard/shared";
import { buildApp } from "../../src/app.js";
import { prisma, truncateAll } from "./db.js";

const app = await buildApp();
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(truncateAll);

const scene: Scene = {
  version: 1,
  shapes: {
    r1: {
      id: "r1",
      type: "rect",
      x: 240,
      y: 80,
      width: 160,
      height: 100,
      rotation: 0,
      style: { fill: "#60a5fa", stroke: "#1d4ed8", strokeWidth: 0, opacity: 1 },
    },
  },
  order: ["r1"],
  connectors: {},
};

/** Registers a user and returns the Cookie header value to send as them. */
async function registerAs(email: string, password = "password123") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password, name: email.split("@")[0] },
  });
  expect(res.statusCode).toBe(201);
  return cookieFrom(res);
}

function cookieFrom(res: { cookies: { name: string; value: string }[] }) {
  const c = res.cookies.find((c) => c.name === "access_token");
  expect(c).toBeDefined();
  return `access_token=${c!.value}`;
}

describe("auth", () => {
  test("register → me → logout → login", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "Ann@Example.com", password: "password123", name: "Ann" },
    });
    expect(reg.statusCode).toBe(201);
    const regCookie = reg.cookies.find((c) => c.name === "access_token");
    expect(regCookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

    const me = await app.inject({ url: "/api/me", headers: { cookie: cookieFrom(reg) } });
    expect(me.statusCode).toBe(200);
    expect(me.json<MeResponse>()).toMatchObject({ email: "ann@example.com", subscription: null });

    const out = await app.inject({ method: "POST", url: "/api/auth/logout" });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.find((c) => c.name === "access_token")?.value).toBe("");

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ann@example.com", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    cookieFrom(login);
  });

  test("duplicate email is 409, bad password is 401, no cookie is 401", async () => {
    await registerAs("bob@example.com");
    const dup = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "BOB@example.com", password: "password123", name: "Bob" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual({ error: "EMAIL_TAKEN" });

    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "bob@example.com", password: "nope-nope" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toEqual({ error: "INVALID_CREDENTIALS" });

    expect((await app.inject({ url: "/api/me" })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: "/api/me", headers: { cookie: "access_token=garbage" } }))
        .statusCode,
    ).toBe(401);
  });

  test("invalid register body is 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "short", name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "VALIDATION_FAILED" });
  });
});

describe("boards", () => {
  test("create → save → load → list", async () => {
    const cookie = await registerAs("ann@example.com");

    const created = await app.inject({
      method: "POST",
      url: "/api/boards",
      headers: { cookie },
      payload: { title: "Plan" },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<BoardDetail>();

    const saved = await app.inject({
      method: "PUT",
      url: `/api/boards/${id}`,
      headers: { cookie },
      payload: { scene },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<BoardSummary>()).toMatchObject({ id, title: "Plan" });

    const loaded = await app.inject({ url: `/api/boards/${id}`, headers: { cookie } });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json<BoardDetail>().scene).toEqual(scene);

    const renamed = await app.inject({
      method: "PUT",
      url: `/api/boards/${id}`,
      headers: { cookie },
      payload: { title: "Plan v2" },
    });
    expect(renamed.statusCode).toBe(200);

    const list = await app.inject({ url: "/api/boards", headers: { cookie } });
    expect(list.json<BoardSummary[]>()).toEqual([
      { id, title: "Plan v2", updatedAt: expect.any(String) },
    ]);
    // Rename kept the scene.
    const reloaded = await app.inject({ url: `/api/boards/${id}`, headers: { cookie } });
    expect(reloaded.json<BoardDetail>().scene).toEqual(scene);
  });

  test("another user can't see, change or delete the board", async () => {
    const ann = await registerAs("ann@example.com");
    const eve = await registerAs("eve@example.com");
    const { id } = (
      await app.inject({
        method: "POST",
        url: "/api/boards",
        headers: { cookie: ann },
        payload: {},
      })
    ).json<BoardDetail>();

    const get = await app.inject({ url: `/api/boards/${id}`, headers: { cookie: eve } });
    expect(get.statusCode).toBe(404);
    const put = await app.inject({
      method: "PUT",
      url: `/api/boards/${id}`,
      headers: { cookie: eve },
      payload: { scene },
    });
    expect(put.statusCode).toBe(404);
    const del = await app.inject({
      method: "DELETE",
      url: `/api/boards/${id}`,
      headers: { cookie: eve },
    });
    expect(del.statusCode).toBe(404);

    const list = await app.inject({ url: "/api/boards", headers: { cookie: eve } });
    expect(list.json()).toEqual([]);
    const own = await app.inject({ url: `/api/boards/${id}`, headers: { cookie: ann } });
    expect(own.json<BoardDetail>().scene).toEqual({
      version: 1,
      shapes: {},
      order: [],
      connectors: {},
    });
  });

  test("an invalid scene is 400 and leaves the board unchanged", async () => {
    const cookie = await registerAs("ann@example.com");
    const { id } = (
      await app.inject({
        method: "POST",
        url: "/api/boards",
        headers: { cookie },
        payload: { scene },
      })
    ).json<BoardDetail>();

    const bad = [
      { scene: { ...scene, shapes: { r1: { ...scene.shapes.r1, type: "hexagon" } } } },
      { scene: { ...scene, order: [] } },
      { scene: { ...scene, version: 2 } },
      { scene: "nope" },
      {},
    ];
    for (const payload of bad) {
      const res = await app.inject({
        method: "PUT",
        url: `/api/boards/${id}`,
        headers: { cookie },
        payload,
      });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }

    const loaded = await app.inject({ url: `/api/boards/${id}`, headers: { cookie } });
    expect(loaded.json<BoardDetail>().scene).toEqual(scene);
  });

  test("non-uuid id is 400, missing board is 404, delete works", async () => {
    const cookie = await registerAs("ann@example.com");
    expect((await app.inject({ url: "/api/boards/123", headers: { cookie } })).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject({ url: `/api/boards/${crypto.randomUUID()}`, headers: { cookie } }))
        .statusCode,
    ).toBe(404);

    const { id } = (
      await app.inject({ method: "POST", url: "/api/boards", headers: { cookie }, payload: {} })
    ).json<BoardDetail>();
    const del = await app.inject({
      method: "DELETE",
      url: `/api/boards/${id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ url: `/api/boards/${id}`, headers: { cookie } })).statusCode).toBe(
      404,
    );
  });

  test("board routes require auth", async () => {
    expect((await app.inject({ url: "/api/boards" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "PUT", url: "/api/boards/not-a-uuid", payload: {} })).statusCode,
    ).toBe(401);
  });

  test("save accepts bodies over 1 MB, up to the 2 MB route limit", async () => {
    const cookie = await registerAs("ann@example.com");
    const { id } = (
      await app.inject({ method: "POST", url: "/api/boards", headers: { cookie }, payload: {} })
    ).json<BoardDetail>();
    const image = (bytes: number): Scene => ({
      ...scene,
      shapes: {
        r1: {
          id: "r1",
          type: "image",
          x: 0,
          y: 0,
          width: 800,
          height: 500,
          rotation: 0,
          style: scene.shapes.r1!.style,
          src: `data:image/png;base64,${"A".repeat(bytes)}`,
        },
      },
    });

    const big = await app.inject({
      method: "PUT",
      url: `/api/boards/${id}`,
      headers: { cookie },
      payload: { scene: image(1_200_000) },
    });
    expect(big.statusCode).toBe(200);

    const tooBig = await app.inject({
      method: "PUT",
      url: `/api/boards/${id}`,
      headers: { cookie },
      payload: { scene: { ...image(10), padding: "x".repeat(2_200_000) } },
    });
    expect(tooBig.statusCode).toBe(413);
  });
});
