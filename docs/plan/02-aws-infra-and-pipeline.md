# Stage 2 — AWS infrastructure and CI/CD (M1, part 2)

## Goal

The Stage 1 skeleton is live at `https://<id>.cloudfront.net`, served by **two EC2 instances, one per service**:

- **frontend instance:** a Caddy container serving the React build (`apps/frontend`).
- **api instance:** the Fastify container (`apps/api`) with Postgres and a Caddy reverse proxy.

One CloudFront distribution sits in front of both: `/*` goes to the frontend instance, `/api/*` to the api instance. The browser sees a single HTTPS origin, so cookies work without CORS or a separate API domain.

A PR runs `ci.yml`; merging to `main` runs `deploy.yml`, which builds and pushes both images, migrates and deploys the API, then deploys the frontend. No AWS keys are stored in GitHub.

The `infra.yml` approval gate, the rollback and alarms come in Stage 9. Here you apply Terraform from your laptop.

```
             ┌──────────── CloudFront (TLS) ────────────┐
             │ /*            → frontend instance :80    │
             │ /api/*        → api instance :80         │
             └──────────────────────────────────────────┘
 frontend EC2 (t4g.micro)            api EC2 (t4g.micro)
   frontend: caddy + dist              caddy :80 → api:3000
                                       api (Fastify)
                                       postgres (volume)
```

## Tasks

### 1. `infra/terraform/bootstrap` (apply once, by hand, local state)

- S3 bucket for Terraform state: versioning on, public access blocked, SSE enabled.
- GitHub OIDC provider (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`).
- IAM role `gh-actions-deploy` whose trust policy allows `repo:<owner>/<repo>:ref:refs/heads/main` only. Permissions: ECR push to the two repos (`whiteboard-api`, `whiteboard-frontend`), `ssm:SendCommand` + `ssm:GetCommandInvocation` on the instances (by tag), S3 write on `deploy/*` in the artifacts bucket, read on the prod Terraform state.
- Outputs: state bucket name, role ARN. Commit the bootstrap code; don't commit its `.tfstate` (or keep it somewhere safe — it's tiny and rarely changes).

> Terraform `plan` on PRs (Stage 9) needs a role that trusts `pull_request` subjects. Add it then as a separate read-only `gh-actions-plan` role, so the `main`-only deploy role stays tight.

### 2. `infra/terraform/envs/prod` + modules

Backend: `s3` with `use_lockfile = true` (native S3 locking, Terraform ≥ 1.10; no DynamoDB table needed). Provider default tags `{ project = "whiteboard", env = "prod" }`.

**`modules/network`**
- VPC `10.0.0.0/16`, one public subnet (in an AZ that offers both instance types), internet gateway, route table.
- Security group shared by both instances: inbound TCP 80 **only** from the managed prefix list `com.amazonaws.global.cloudfront.origin-facing` (look it up with `data "aws_ec2_managed_prefix_list"`). No port 22. Egress all.

**`modules/registry`** (instantiated once per service with `for_each`)
- ECR repos `whiteboard-api` and `whiteboard-frontend`, scan on push, lifecycle policy keeping the last 10 images.

**`modules/compute`** (instantiated twice: `api_server`, `frontend_server`)
- AMI: latest Amazon Linux 2023 ARM64 via SSM public parameter `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64`.
- `t4g.micro` for each (separate `api_instance_type` / `frontend_instance_type` variables; the frontend could drop to `t4g.nano`), 20 GB gp3 root volume, public IP, IMDSv2 required, tag `service = api|frontend`.
- Instance profile per instance: `AmazonSSMManagedInstanceCore`, `AmazonEC2ContainerRegistryReadOnly`, `CloudWatchAgentServerPolicy`, plus an inline policy:
  - **api:** `ssm:GetParameters*` on `/whiteboard/prod/*` (and `kms:Decrypt` for the default SSM key), read/write on the artifacts bucket (backups in Stage 9).
  - **frontend:** read on the artifacts bucket only. It holds no secrets.
- User data (same script for both; keep it short and idempotent):
  - install Docker + the compose plugin, enable the service;
  - create a **1–2 GB swap file** (1 GB RAM isn't enough for Postgres + Node + image pulls);
  - install the CloudWatch agent (host memory/disk metrics; container logs go via the `awslogs` driver below);
  - create `/opt/whiteboard`.
- Don't put the compose files in user data: changing user data replaces the instance, and Postgres lives on the api instance.
- Output each instance's ID and **public DNS name** (CloudFront origins must be DNS names, not IPs).

**`modules/artifacts`**
- Private artifacts bucket: `deploy/api/` and `deploy/frontend/` (compose files per instance) and, in Stage 9, `backups/`.

**`modules/cdn`**
- CloudFront distribution with two custom origins, both HTTP only, port 80:
  - Default behaviour `/*` → frontend instance, `CachingOptimized`, redirect HTTP → HTTPS. TTLs follow the `Cache-Control` headers the frontend's Caddy sets (see below).
  - Behaviour `/api/*` → api instance, `CachingDisabled`, origin request policy `AllViewerExceptHostHeader` (forwards cookies, query strings, headers), all HTTP methods allowed.
  - SPA routing is done by the frontend's Caddy (`try_files {path} /index.html`), not by CloudFront. Don't use distribution-wide custom error responses for it — they'd also turn the API's 404s into `index.html`.

**`modules/observability`** (minimal now)
- Log groups `/whiteboard/prod/api` and `/whiteboard/prod/frontend`, 14-day retention.
- AWS Budget with a $1 alert to your email (it's cheap to add now, useful immediately). Two instances means the budget alert fires sooner; that's expected.

**SSM parameters** (in `envs/prod`): create `/whiteboard/prod/DATABASE_URL`, `/whiteboard/prod/JWT_SECRET` and `/whiteboard/prod/POSTGRES_PASSWORD` as SecureString with placeholder values and `lifecycle { ignore_changes = [value] }`. Set real values once with `aws ssm put-parameter --overwrite`. The Gemini and Razorpay parameters are added in Stages 7–8. Only the api instance reads them.

### 3. Images

**`apps/api/Dockerfile`** — unchanged: pnpm deploy of the API, `node dist/server.js` on port 3000.

**`apps/frontend/Dockerfile`** — two stages:
- `build` on `--platform=$BUILDPLATFORM` (the output is static, so no emulation needed): `pnpm install --filter frontend...`, `pnpm --filter frontend build`.
- `runtime`: `caddy:2-alpine`, copies `dist/` to `/srv` and `apps/frontend/Caddyfile`.

**`apps/frontend/Caddyfile`** (`:80`, plain HTTP):
- `/healthz` → `200 ok`, `Cache-Control: no-store` (container healthcheck).
- `/assets/*` that exist → `Cache-Control: public, max-age=31536000, immutable`. Missing `/assets/*` → 404, **not** `index.html` (CloudFront would cache HTML as year-long JS).
- Everything else → `try_files {path} /index.html`, `Cache-Control: no-cache`.

### 4. `infra/docker` (one folder per instance)

**`api/docker-compose.yml`** — three services:
- `caddy`: `caddy:2`, port `80:80`, mounts the `Caddyfile`.
- `api`: `${ECR_REPO}:${API_IMAGE_TAG}`, `env_file: /opt/whiteboard/.env`, restart `unless-stopped`, `logging.driver: awslogs` pointed at `/whiteboard/prod/api`.
- `postgres`: `postgres:16`, named volume `pgdata`, healthcheck with `pg_isready`, not published to the host. Low-memory settings (`shared_buffers=64MB`, `max_connections=20`).
- `api` `depends_on: postgres: condition: service_healthy`.

**`api/Caddyfile`**: `:80 { reverse_proxy api:3000 }`. Plain HTTP; CloudFront terminates TLS.

**`api/deploy.sh`** (copied to the api instance by the workflow). Given an image tag:
1. Pull `/whiteboard/prod/*` from SSM into `/opt/whiteboard/.env` (mode 600, root-owned).
2. `aws ecr get-login-password | docker login`.
3. Write `API_IMAGE_TAG=<tag>` into `/opt/whiteboard/deploy.env`.
4. `docker compose pull api`.
5. `docker compose up -d postgres` and wait for healthy.
6. `docker compose run --rm api npx prisma migrate deploy`.
7. `docker compose up -d api caddy`.

**`frontend/docker-compose.yml`** — one service `frontend`: `${ECR_REPO}:${FRONTEND_IMAGE_TAG}`, port `80:80`, healthcheck on `/healthz`, `awslogs` to `/whiteboard/prod/frontend`.

**`frontend/deploy.sh`**: ECR login, write `FRONTEND_IMAGE_TAG=<tag>` into `deploy.env`, `docker compose pull frontend`, `docker compose up -d --wait frontend` (fails if the healthcheck never passes), prune old images.

Stage 9 adds "record previous tag + roll back" around the switch in both scripts.

### 5. GitHub Actions

**`.github/scripts/ssm-deploy.sh <service> <instance-id> <ecr-repo> <tag>`**: `aws ssm send-command --document-name AWS-RunShellScript` with commands: copy `s3://<artifacts>/deploy/<service>/` to `/opt/whiteboard`, run `deploy.sh <tag>`. Poll `get-command-invocation` until done; fail if the command failed, and print its stdout/stderr. Both deploy jobs use it.

**`ci.yml`** (on `pull_request`):
1. `pnpm/action-setup` + `actions/setup-node` with pnpm cache; `pnpm install --frozen-lockfile`.
2. `pnpm -r lint`, `pnpm -r typecheck`.
3. Tests with a `postgres:16` service container; set `DATABASE_URL`, run `prisma migrate deploy` first.
4. `pnpm -r build`.
5. `docker buildx build` of both images (matrix `api`, `frontend`; not pushed). Add `prisma migrate diff` here in Stage 3, once there are migrations.

**`deploy.yml`** (on `push` to `main`), `permissions: id-token: write, contents: read`, `concurrency: deploy` so two merges don't deploy at once:
1. **`image`** (matrix `api`, `frontend`): `aws-actions/configure-aws-credentials` with the `gh-actions-deploy` role; build and push the ARM64 image tagged with `${{ github.sha }}` to its ECR repo. Prefer the native `ubuntu-24.04-arm` runner if it's available for your repo; otherwise use `docker/setup-qemu-action` + buildx `--platform linux/arm64` (slower). Use the GHA build cache, one scope per service.
2. **`deploy-api`** (needs `image`): `aws s3 cp infra/docker/api/ s3://<artifacts>/deploy/api/ --recursive`, `ssm-deploy.sh api …`, then poll `https://<cloudfront>/api/health` for up to 60 s.
3. **`deploy-frontend`** (needs `deploy-api`, so migrations and new endpoints land before the UI that uses them): upload `infra/docker/frontend/`, `ssm-deploy.sh frontend …`, then a `GET https://<cloudfront>/` smoke check.

No CloudFront invalidation is needed: `index.html` is `no-cache`, and hashed assets never change under the same name.

Store non-secret IDs (role ARN, bucket name, CloudFront domain, both instance IDs, both ECR URLs, region) as GitHub **repository variables**, not secrets. They come from `terraform output github_variables`.

## Done when

- [ ] `terraform apply` in `envs/prod` from a clean state creates everything (two instances) in about 10 minutes, and `terraform destroy` removes it (bootstrap stays).
- [ ] `curl http://<either-instance-public-dns>/` from your laptop **times out** (security group works); through CloudFront, `/` returns the app and `/api/health` returns 200.
- [ ] `aws ssm start-session --target <instance-id>` gets you a shell on each instance; no SSH key exists anywhere.
- [ ] A PR shows `ci.yml` green, including both image builds. Merging it deploys both services without manual steps, and the change is visible on the CloudFront URL.
- [ ] Refreshing a deep link such as `/boards/abc` serves the SPA, `/assets/nope.js` returns 404, and `/api/does-not-exist` still returns the API's JSON 404.
- [ ] Logs appear in CloudWatch under `/whiteboard/prod/api` and `/whiteboard/prod/frontend`.
- [ ] The frontend instance has no `/opt/whiteboard/.env` and its role can't read `/whiteboard/prod/*`.

## Gotchas

- **ARM builds:** both images must be `linux/arm64`. An amd64 image on the instance fails with `exec format error`.
- **Instance replacement changes the public DNS.** Terraform updates the CloudFront origin automatically, but the distribution takes a few minutes to redeploy. Update the `*_INSTANCE_ID` GitHub variable afterwards.
- **Old assets vanish on deploy.** A tab that loaded the previous `index.html` may request hashed chunks the new container doesn't have. CloudFront usually still has them cached; if not, a reload fixes it. (Same trade-off as `s3 sync --delete`.)
- **Public IPv4 is billed hourly**, and so is each instance — twice the cost of one box. Destroy at night if you're watching credits; restore data from backups once Stage 9 has them.
- **SSM agent needs outbound internet.** In a public subnet with a public IP, it has it. If you ever remove the public IP, you'll need VPC endpoints.
- **CloudFront → EC2 is plain HTTP.** Fine for this test-mode project; a real deployment would add TLS at the origin.
