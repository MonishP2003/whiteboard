# Stage 9 — Hardening (M8)

## Goal

The pipeline recovers from a bad deploy by itself, you hear about errors and spending, the database survives a `terraform destroy`, and infrastructure changes go through a reviewed plan and a manual approval.

## Tasks

### 1. Health-check rollback (`deploy.yml` + both `deploy.sh`)

- `infra/docker/api/deploy.sh`: before switching, read the current `API_IMAGE_TAG` from `/opt/whiteboard/deploy.env` and save it as `/opt/whiteboard/previous.env`. Add a `rollback.sh` (or `deploy.sh --rollback`) that restores `previous.env` and runs `docker compose up -d api`.
- `infra/docker/frontend/deploy.sh`: the same for `FRONTEND_IMAGE_TAG`. Its `up --wait` already fails on an unhealthy container, so it can roll back right there.
- `deploy.yml`, after the `deploy-api` SSM step: poll `https://<cloudfront>/api/health` for 60 s. On failure, send a second SSM command that runs the rollback, wait for it, re-check health, and **fail the workflow** either way so you notice.
- `deploy-frontend` runs only if `deploy-api` (including its health check) succeeded — keep it a separate job with `needs: deploy-api`, not a parallel one.
- Make `/api/health` meaningful: DB reachable, and optionally the running image tag/commit SHA in the response so the workflow can confirm the *new* version is serving.
- Keep migrations additive (see the README). Rollback restores code only; a migration that dropped a column would break the old image too.

**Test it:** merge a commit where the health route returns 500. The workflow should roll back, the site keep working, and the run be red.

### 2. Alarms (`modules/observability`)

- CloudWatch Logs **metric filter** on `/whiteboard/prod/api` for 5xx responses. Fastify/pino logs JSON lines with `res.statusCode` on request completion; the filter pattern is `{ $.res.statusCode >= 500 }`. Metric `Whiteboard/Api5xx`.
- Alarm: sum ≥ 5 in 5 minutes → SNS topic → email subscription (confirm the email once).
- Optional: `StatusCheckFailed` alarms on both instances, and memory/disk alarms from the CloudWatch agent metrics (disk fills up with old Docker images — add `docker image prune -af --filter "until=168h"` to both `deploy.sh`).
- The $1 budget from Stage 2 stays; consider a second one at your monthly credit burn target.

**Test it:** add a temporary route that throws, hit it 10 times, get the email, remove the route.

### 3. Nightly `pg_dump` to S3

- A `backup.sh` in `infra/docker/api/`, copied to the **api** instance by the deploy like the compose files (the frontend instance holds no data and can only read the bucket):
  `docker compose exec -T postgres pg_dump -U whiteboard -Fc whiteboard | aws s3 cp - s3://<artifacts>/backups/$(date +%F).dump`
- Schedule it: a systemd timer or cron entry installed by the deploy step (not user data, so it can change without replacing the instance), or an **SSM State Manager association** running `AWS-RunShellScript` on a `cron(0 2 * * ? *)` schedule — the latter lives in Terraform, which is nice.
- S3 lifecycle rule on `backups/`: expire after 14 days. Bucket stays private, versioned optional.
- `restore.sh <date>`: download the dump, `pg_restore --clean --if-exists` into the running Postgres. Run it after `terraform apply` rebuilds the stack.
- The artifacts bucket must **not** be destroyed by `terraform destroy` of `envs/prod` if you use the nightly-destroy pattern: either move it to `bootstrap`, or set `prevent_destroy` and target the destroy. Pick one and write it down in the module's README.

**Test it:** create a board, run the backup, `terraform destroy` + `apply`, deploy, restore, and see the board again.

### 4. `infra.yml` with an approval gate

- Bootstrap: add a read-only `gh-actions-plan` role that trusts `repo:<owner>/<repo>:pull_request`, with `ReadOnlyAccess` plus read on the state bucket (and write on the lock file, since `plan` takes the lock — or run plan with `-lock=false`).
- Also let the `gh-actions-deploy` role (or a separate `gh-actions-apply` role trusting `repo:<owner>/<repo>:environment:production`) run `apply`. Trusting the environment subject is cleaner: only jobs in the approved environment can assume it.
- Workflow `on: pull_request` / `push` to `main`, `paths: ["infra/terraform/**"]`:
  - PR job: `terraform fmt -check -recursive`, `terraform init`, `validate`, `plan -out tfplan -no-color`; post the plan as a PR comment (update the same comment on new pushes; truncate long plans).
  - Main job: `environment: production` (GitHub environment with **you** as required reviewer), `terraform apply` — re-plan and apply, or apply a plan artifact uploaded by an earlier job in the same run.
- Add `tflint` and/or `checkov`/`trivy config` to the PR job if you want extra practice.

### 5. Small security and ops items

- API: `@fastify/helmet` (CSP is mostly CloudFront's job for the static site — add a response headers policy there with HSTS, `X-Content-Type-Options`, frame options), `@fastify/rate-limit` globally on auth routes (brute force on login).
- `trustProxy` set so Fastify logs the real client IP from `X-Forwarded-For`.
- Graceful shutdown already exists (Stage 1); set compose `stop_grace_period: 20s`.
- Dependabot or Renovate for npm, Docker and GitHub Actions versions.
- A short `docs/runbook.md`: how to deploy, roll back by hand, rotate a secret, restore a backup, destroy and recreate.

## Done when

- [ ] A deliberately broken deploy rolls back automatically and the site never goes down for more than the health-check window.
- [ ] A burst of 5xx errors sends an email within ~5 minutes.
- [ ] A backup appears in S3 every night; destroy → apply → deploy → restore brings the data back.
- [ ] A PR touching `infra/terraform/` gets a plan comment; merging waits for your approval before `apply`.
- [ ] No long-lived AWS credentials exist in GitHub or on your laptop's CI config; `git grep` finds no secrets.

## Gotchas

- `pg_dump` from inside the container writes to stdout; use `-T` with `docker compose exec` or the output gets TTY-mangled.
- The t4g.micro has 1 GB RAM plus swap. Run backups at a quiet hour and make sure the image prune doesn't remove the image for the *previous* tag you may need for rollback (`--filter until=` older than a week is safe).
- Once `infra.yml` applies from CI, stop running `terraform apply` for prod from your laptop, or you'll fight over state and drift.
