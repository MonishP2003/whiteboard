# Build plan

Stage-by-stage plan for the whiteboard app described in the **Whiteboard App — End-to-End Architecture** doc (claude.ai artifact, not in this repo). Build the stages in order. Every stage ships through the pipeline from Stage 2, so UI and infra grow together.

| # | File | Milestone | Outcome |
|---|------|-----------|---------|
| 1 | [01-monorepo-and-local-skeleton.md](01-monorepo-and-local-skeleton.md) | M1 (part 1) | pnpm monorepo, `/api/health`, Vite app with one Konva rect, all running locally |
| 2 | [02-aws-infra-and-pipeline.md](02-aws-infra-and-pipeline.md) | M1 (part 2) | Terraform bootstrap + prod, `ci.yml`, `deploy.yml`; frontend and api on two EC2 instances behind one CloudFront URL |
| 3 | [03-auth-and-boards.md](03-auth-and-boards.md) | M2 | Prisma schema, register/login, board CRUD through all five layers, autosave |
| 4 | [04-core-canvas.md](04-core-canvas.md) | M3 | Pan/zoom, select, move, resize, rotate; rect, ellipse, text, sticky, freehand |
| 5 | [05-ui-shell.md](05-ui-shell.md) | M4 | Floating toolbar, format panel, shape drawer, zoom controls |
| 6 | [06-connectors-undo-export.md](06-connectors-undo-export.md) | M5 | Connectors, undo/redo, PNG/SVG export |
| 7 | [07-ai-diagrams-and-charts.md](07-ai-diagrams-and-charts.md) | M6 | Gemini → nodes/edges → elkjs layout; AI charts via Chart.js |
| 8 | [08-razorpay-paywall.md](08-razorpay-paywall.md) | M7 | Orders API, Checkout, verified webhook, paywall on AI endpoints |
| 9 | [09-hardening.md](09-hardening.md) | M8 | Health-check rollback, 5xx alarm, nightly `pg_dump`, `infra.yml` approval gate |

M1 is split in two because "monorepo + app" and "AWS + CI/CD" are each a solid chunk of work, and you want the local loop working before you debug it on AWS.

## Rules that apply to every stage

- **Layering (backend):** Route → Middleware → Controller → Service → Repository/Integration. Only repositories import Prisma. Only controllers see `req`/`reply`. Services throw `AppError`; only `errorHandler.ts` turns errors into responses.
- **Store is the source of truth (frontend):** tools dispatch store actions; Konva only renders. Never mutate Konva nodes as state.
- **Two services, two instances:** `apps/frontend` and `apps/api` each ship as their own image to their own EC2 instance. Only the api instance holds secrets and data. CloudFront joins them into one origin.
- **Shared contracts:** any type or Zod schema used by both frontend and api lives in `packages/shared`.
- **Migrations are additive:** add columns now, drop them in a later release, so rollback stays safe.
- **Each stage ends with a merged PR that deployed green.** From Stage 2 onward, "done" means working on the CloudFront URL, not just locally.

## Open decision carried from the architecture doc

The doc has an open comment: **ARM `t4g.micro` vs x86 `t3.micro`**. These plans assume ARM, as the doc does. If you switch to x86, change three things: both instance types and the AMI in Stage 2 `compute`, drop `--platform linux/arm64` and the ARM runner in `ci.yml`/`deploy.yml`, and drop the Prisma `binaryTargets` note. Nothing else changes.

## Before Stage 1

- Check which AWS plan your account is on. The Free plan closes the account after six months or when credits run out.
- Create accounts/keys you'll need later: Gemini API key (Google AI Studio), Razorpay test-mode account. Neither is needed until Stages 7–8.
- Tooling: Node 22 LTS, pnpm 9+, Docker Desktop, Terraform ≥ 1.10, AWS CLI v2 with the Session Manager plugin.
