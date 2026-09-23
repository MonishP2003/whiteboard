# Stage 1 — Monorepo and local walking skeleton (M1, part 1)

## Goal

A pnpm workspace with `apps/frontend`, `apps/api` and `packages/shared`. Locally, `pnpm dev` starts both apps: the frontend shows one Konva rectangle and calls `GET /api/health`, which checks the database and returns `{ status: "ok" }`. The API image builds for ARM64.

No AWS yet. Stage 2 puts this exact skeleton on AWS.

## Tasks

### 1. Workspace root

- `package.json` (private, `"packageManager": "pnpm@9.x"`), scripts that fan out: `dev`, `build`, `lint`, `typecheck`, `test` (all `pnpm -r --parallel` or `pnpm -r`).
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `target: "ES2022"`.
- ESLint flat config (`eslint.config.js`) with `typescript-eslint`, plus Prettier. `.editorconfig`, `.gitignore` (node_modules, dist, .env*, *.tfstate, .terraform).
- `.nvmrc` with the Node version.

### 2. `packages/shared`

- `package.json` name `@whiteboard/shared`, `"exports": { ".": "./src/index.ts" }`. Consumers compile the TS source directly (Vite does it for the frontend; the API bundler does it for api), so there's no separate build step.
- `src/index.ts` re-exports `scene.ts`, `ai.ts`, `api.ts`. For now only `api.ts` has content: `HealthResponse` type + Zod schema.
- Depends on `zod`.

### 3. `apps/api` skeleton

Create the folder layout from the architecture doc now, even the empty folders, so later stages only fill it in.

- Dependencies: `fastify`, `zod`, `@fastify/cookie`, `pino` (Fastify's logger), `prisma` + `@prisma/client`.
- Dev: `tsx` (watch mode), `tsup` (build), `vitest`.
- `src/config/env.ts`: parse `process.env` with Zod (`NODE_ENV`, `PORT`, `DATABASE_URL`, later `JWT_SECRET` etc.). Crash on startup if invalid.
- `src/config/prisma.ts`: single exported `PrismaClient`.
- `src/utils/AppError.ts`: `class AppError extends Error { constructor(public status: number, public code: string) }`.
- `src/middlewares/errorHandler.ts`: `AppError` → `reply.code(status).send({ error: code })`; Zod/validation errors → 400; anything else → log + 500 `{ error: "INTERNAL" }`.
- `src/app.ts`: `buildApp()` creates Fastify, registers cookie plugin, sets the error handler, registers `routes/index.ts` under prefix `/api`. Returns the instance, doesn't listen (tests use `app.inject()`).
- `src/server.ts`: `buildApp()` then `listen({ host: "0.0.0.0", port })`. Handle `SIGTERM` with `app.close()`.
- `routes/health.routes.ts`: `GET /health` → runs `SELECT 1` through a tiny repository function (`health.repository.ts` or a method on an existing repo) so even this respects "only repositories touch Prisma". Returns 200 `{ status: "ok" }` or 503 `{ status: "db_unavailable" }`.
- `prisma/schema.prisma`: datasource + generator only for now (models come in Stage 3). If your Prisma version ships a native query engine, add `binaryTargets = ["native", "linux-arm64-openssl-3.0.x"]`.
- Enforce layering with ESLint `no-restricted-imports`: `@prisma/client` and `config/prisma` may only be imported from `src/repositories/**`; `fastify` types only from routes, middlewares, controllers, `app.ts`, `server.ts`.
- `tsup.config.ts`: entry `src/server.ts`, format `esm`, target `node22`, `noExternal: ["@whiteboard/shared"]` (bundles the shared TS), keep `@prisma/client` external.

### 4. `apps/api/Dockerfile`

Multi-stage:

1. `base`: `node:22-slim`, enable corepack/pnpm.
2. `build`: copy workspace manifests + lockfile first (layer cache), `pnpm install --frozen-lockfile`, copy source, `pnpm --filter api exec prisma generate`, `pnpm --filter api build`.
3. `runtime`: `node:22-slim`, install `openssl` (Prisma needs it), copy `dist/`, the pruned production `node_modules` (`pnpm --filter api deploy --prod /out`), and `prisma/` (schema + migrations). Keep the `prisma` CLI in the image: Stage 2's deploy runs `prisma migrate deploy` from this image as a one-off container. Run as the `node` user, `CMD ["node", "dist/server.js"]`.

Check it builds for the target: `docker buildx build --platform linux/arm64 -f apps/api/Dockerfile .`

### 5. Local Postgres

- `infra/docker/docker-compose.dev.yml` (an addition to the doc's tree): Postgres 16 only, port 5432, named volume. Local dev runs the API with `tsx`, not in Docker.
- `apps/api/.env.example` with `DATABASE_URL=postgresql://whiteboard:whiteboard@localhost:5432/whiteboard`.

### 6. `apps/frontend` skeleton

- `pnpm create vite` (React + TS). Add `react-konva`, `konva`, `zustand`, `immer`, Tailwind CSS, then `shadcn` init (it sets up `components/ui` and the `@/` alias) and `lucide-react`.
- Create the `src/` folder layout from the doc (`app/`, `canvas/`, `store/`, `features/*`, `lib/`).
- `canvas/Stage.tsx`: full-window `<Stage>` with one `<Layer>` and one draggable `<Rect>`. Resize with the window.
- `lib/api.ts`: a thin `fetch` wrapper with `credentials: "include"`, JSON in/out, throws on non-2xx with the `{ error }` code. Base path is just `/api` (same origin in dev via proxy, same origin in prod via CloudFront).
- Show the health status in a corner badge using `HealthResponse` from shared.
- `vite.config.ts`: `server.proxy["/api"] = "http://localhost:3000"`.

### 7. Tests and scripts

- One API integration test: `buildApp()` + `app.inject({ url: "/api/health" })` → 200. Uses the local Postgres.
- One frontend smoke test is optional; don't set up browser testing yet.
- Root scripts work: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Done when

- [ ] `docker compose -f infra/docker/docker-compose.dev.yml up -d` then `pnpm dev` → browser at `localhost:5173` shows a draggable rect and "API: ok".
- [ ] Stopping Postgres makes the badge show the 503 state.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass from the root.
- [ ] Importing `@prisma/client` from a service file fails lint.
- [ ] `docker buildx build --platform linux/arm64` succeeds and the container starts with a `DATABASE_URL`.

## Gotchas

- Put `"type": "module"` in the API package and keep ESM throughout; mixing CJS and ESM with Prisma and tsup wastes time.
- `pnpm deploy` needs the lockfile and `inject-workspace-packages` behaviour on newer pnpm versions. If it complains, pin pnpm 9 or set `inject-workspace-packages=true` in `.npmrc`.
- Run `prisma generate` in the build stage *and* make sure the generated client ends up in the runtime stage's `node_modules`.
