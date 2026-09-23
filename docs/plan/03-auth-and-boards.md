# Stage 3 — Auth and boards (M2)

## Goal

Users can register, log in, and log out. A logged-in user sees their boards, creates one, opens it, and the canvas autosaves 2 seconds after the last change. Every endpoint goes through all five backend layers, and the scene is validated with the shared Zod schema on save.

## Tasks

### 1. Data model and migration

- Add all five models from the architecture doc to `schema.prisma` now: `User`, `Board`, `Subscription`, `Payment`, `AiUsage` (+ both enums). Adding them in one migration avoids a string of small ones later, and the payment/AI tables simply stay empty until Stages 7–8.
- `pnpm --filter api prisma migrate dev --name init`. Commit the migration.
- `prisma/seed.ts`: one demo user with one board, for local dev only.
- Add to `ci.yml`: `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $DATABASE_URL --exit-code`, so a schema change without a migration fails the PR.

### 2. Shared contracts (`packages/shared`)

- `scene.ts`: the `Style`, `Shape` (discriminated union on `type`), `Connector` and `Scene` types from the doc, each as a Zod schema with the TS type derived by `z.infer`. Include `image` and connectors now, even though they're drawn later, so the saved format doesn't change.
  - `Style`: `fill`, `stroke`, `strokeWidth`, `opacity`, optional `fontSize`, `fontFamily`, `textAlign`. Keep it small; Stage 5 may add fields as optional.
  - Put limits in the schema: max shapes (e.g. 5 000), max freehand points per stroke, max string lengths.
  - Export `emptyScene()`.
- `api.ts`: `RegisterBody`, `LoginBody`, `MeResponse` (`{ id, email, name, subscription: { status, expiresAt } | null }`), `BoardSummary`, `BoardDetail`, `CreateBoardBody`, `SaveBoardBody` (`{ title?, scene }`), `BoardIdParams`.

### 3. Backend

**Config:** add `JWT_SECRET` (min 32 chars) to `env.ts`; locally in `.env`, in prod in SSM (already created in Stage 2 — set its value now).

**Middlewares**

- `validate.ts`: `validate({ body?, params?, query? })` returns a `preHandler` that parses with Zod, replaces `req.body` etc. with the parsed value, and throws `AppError(400, "VALIDATION_FAILED")` (include Zod issues in dev only).
- `authenticate.ts`: read `access_token` cookie, verify, set `req.user = { id, email }`, else 401. Declare `user` on `FastifyRequest` with module augmentation.

**Auth**

- `utils/crypto.ts`: password hashing with `@node-rs/argon2` (prebuilt ARM64 binaries, no compiler needed) and JWT sign/verify (`jose` or `@fastify/jwt`). Access token lifetime ~7 days is fine for a learning project; no refresh tokens.
- `user.repository.ts`: `findByEmail`, `findById` (include subscription), `create`.
- `auth.service.ts`: `register` (normalize email to lowercase, 409 `EMAIL_TAKEN` on duplicate), `login` (401 `INVALID_CREDENTIALS` for both unknown email and wrong password), `me`.
- `auth.controller.ts`: sets cookie `access_token` with `httpOnly`, `secure` (in prod), `sameSite: "lax"`, `path: "/"`. Returns `MeResponse`.
- `auth.routes.ts`: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` (clears cookie), `GET /me` (authenticate). `/me` is what Stage 8 polls after payment.

**Boards** — exactly the worked example from the doc, extended:

- `board.repository.ts`: `listByOwner` (select id, title, updatedAt; order by `updatedAt desc`), `findById`, `create`, `updateScene`, `delete`.
- `board.service.ts`: `listForUser`, `create`, `getOwned` (404 then 403 check), `save`, `delete`. Consider returning 404 instead of 403 for other users' boards so IDs can't be probed — pick one and be consistent.
- `board.controller.ts`, `board.routes.ts`: `GET /boards`, `POST /boards`, `GET /boards/:id`, `PUT /boards/:id`, `DELETE /boards/:id`.
- Body limit: set `bodyLimit` on `PUT /boards/:id` (e.g. 2 MB; AI chart images in Stage 7 are data URLs). Leave the global default low.

**Tests**

- Unit (`tests/unit`): `board.service` and `auth.service` with the repositories replaced by plain objects — ownership rules, duplicate email, wrong password.
- Integration (`tests/integration`): register → login (cookie) → create board → save → load → other user gets 403/404 → invalid scene gets 400. Truncate tables between tests.

### 4. Frontend

- Routing (`app/`): `react-router`. Routes: `/login`, `/register`, `/boards` (list), `/boards/:id` (editor). A `RequireAuth` wrapper calls `GET /api/me` once and redirects to `/login` on 401.
- `store/authStore.ts`: `user`, `subscription`, `fetchMe()`, `login()`, `logout()`.
- `features/auth/`: login and register pages with shadcn `Form`/`Input`/`Button`, validation via the shared Zod schemas (`react-hook-form` + `@hookform/resolvers/zod`).
- `features/boards/`: board list (cards with title + relative updated time), "New board" button, rename, delete with confirm.
- `store/sceneStore.ts`: Zustand + immer, holding `Scene` plus actions `loadScene`, `addShape`, `updateShape`, `deleteShapes`. (zundo gets wrapped around it in Stage 6.) The Stage 1 rect now comes from the store.
- Autosave hook (`features/boards/useAutosave.ts`): subscribe to `sceneStore`, debounce 2 s, `PUT` the whole scene. Show a "Saving… / Saved / Save failed" indicator. Flush pending saves on `beforeunload` and when leaving the route. Skip the save triggered by `loadScene` itself.

## Done when

- [ ] Register, log out, log in again; `/boards` shows only your boards.
- [ ] Create a board, drag the rect, wait 2 s, reload: the rect is where you left it.
- [ ] Opening another user's board ID shows a not-found page; the API returns 403/404.
- [ ] Sending a malformed scene with `curl` returns 400 and doesn't change the stored board.
- [ ] `ci.yml` runs unit + integration tests and the migration drift check; the deploy runs `migrate deploy` and the feature works on CloudFront.

## Gotchas

- Cookies work because the frontend and API share one origin (Vite proxy locally, one CloudFront distribution in front of both EC2 instances in prod). Don't introduce a separate API domain.
- `secure: true` cookies aren't set over plain `http://localhost` in some browsers; make `secure` depend on `NODE_ENV`.
- Prisma's `Json` type won't accept your `Scene` type directly; cast at the repository boundary (`scene as Prisma.InputJsonValue`) and parse with the Zod schema on the way out if you want strong guarantees on read.
