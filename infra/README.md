# Infrastructure

Two services on two EC2 instances, behind one CloudFront distribution:

| Path     | Origin            | Runs                                                   |
| -------- | ----------------- | ------------------------------------------------------ |
| `/*`     | frontend instance | `whiteboard-frontend` image (Caddy + the React build)  |
| `/api/*` | api instance      | Caddy → `whiteboard-api` image (Fastify) + Postgres 16 |

```
infra/
  terraform/bootstrap/   state bucket, artifacts bucket, GitHub OIDC, CI roles (local state, applied by hand)
  terraform/envs/prod/   everything else (S3 backend; applied by infra.yml)
  terraform/modules/     network, registry, compute (x2), artifacts, cdn, observability, backup
  docker/api/            api instance: compose stack + Caddyfile + deploy/rollback/backup/restore.sh
  docker/frontend/       frontend instance: compose stack + deploy.sh + rollback.sh
  docker/docker-compose.dev.yml   local Postgres only
```

`deploy.yml` copies `docker/<service>/` to `s3://<artifacts>/deploy/<service>/`, and SSM syncs it to `/opt/whiteboard` on that service's instance.

Region defaults to `ap-south-1`. Change `region` in both stacks (and `backend.hcl`) to move it.

## First-time setup

Needs Terraform ≥ 1.10, AWS CLI v2 + Session Manager plugin, and admin credentials on your laptop.

### 1. Bootstrap (once)

```sh
cd infra/terraform/bootstrap
terraform init
terraform apply
```

Keep `terraform.tfstate` somewhere safe (it's gitignored). Outputs: `state_bucket`, `artifacts_bucket`, `deploy_role_arn`, `plan_role_arn`, `apply_role_arn`.

The CI roles (all GitHub OIDC, no stored keys):

| Role                | Assumable by                                | Can                                            |
| ------------------- | ------------------------------------------- | ---------------------------------------------- |
| `gh-actions-deploy` | `main` branch (`deploy.yml`)                | push images, SSM commands, write `deploy/`     |
| `gh-actions-plan`   | pull requests and `main` (`infra.yml` plan) | `ReadOnlyAccess`, minus `backups/`             |
| `gh-actions-apply`  | the `production` environment (`infra.yml`)  | `PowerUserAccess` + IAM on `whiteboard-prod-*` |

If the account already has a GitHub OIDC provider, import it first:
`terraform import aws_iam_openid_connect_provider.github arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com`.

### 2. Prod

```sh
cd infra/terraform/envs/prod
cp backend.hcl.example backend.hcl            # bucket = bootstrap's state_bucket
cp terraform.tfvars.example terraform.tfvars  # budget alert email
terraform init -backend-config=backend.hcl
terraform apply
```

Confirm the **SNS subscription email** ("AWS Notification - Subscription Confirmation") when it arrives: alarms and backup failures go nowhere until you do. Budget alerts are sent directly and need no confirmation.

This first `apply` runs from your laptop. After that, `infra.yml` applies prod (see step 6); stop running `terraform apply` for prod locally, or you and CI will fight over state.

### 3. Secrets (once; Terraform ignores later value changes)

```sh
PW=$(openssl rand -hex 24)
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/POSTGRES_PASSWORD --value "$PW"
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/DATABASE_URL \
  --value "postgresql://whiteboard:$PW@postgres:5432/whiteboard"
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/JWT_SECRET \
  --value "$(openssl rand -hex 32)"
# Google AI Studio key (Stage 7). The AI routes return 503 while it's unset.
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/GEMINI_API_KEY \
  --value "<key from https://aistudio.google.com/apikey>"
```

Razorpay (Stage 8). **Test mode only**: test and live keys and webhook secrets are different.

```sh
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/RAZORPAY_KEY_ID   --value "rzp_test_..."
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/RAZORPAY_KEY_SECRET   --value "<test key secret>"
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/RAZORPAY_WEBHOOK_SECRET   --value "$(openssl rand -hex 32)"
```

Then in the Razorpay dashboard (Test Mode → Account & Settings → Webhooks), add a webhook to `https://<CLOUDFRONT_DOMAIN>/api/payments/webhook` for the `payment.captured` and `payment.failed` events, with the same webhook secret. The signature arrives in `X-Razorpay-Signature`, which CloudFront forwards only because the `/api/*` behaviour uses `AllViewerExceptHostHeader`; keep that header if the origin request policy is ever tightened.

Razorpay can't reach `localhost`. To test webhooks locally, run a tunnel (`cloudflared tunnel --url http://localhost:5173`) and point a second test-mode webhook at `<tunnel>/api/payments/webhook`. The integration tests sign fixture bodies themselves, so they need neither.

Optionally add a plain `/whiteboard/prod/GEMINI_MODEL` parameter to override the default model. Parameter changes take effect on the next deploy (`deploy.sh` rewrites `.env` and recreates the api container).

Postgres only reads `POSTGRES_PASSWORD` when it initialises an empty volume. To rotate it later, `ALTER USER` inside the container as well.

Every parameter under `/whiteboard/prod/` ends up in the API's environment (`/opt/whiteboard/.env` on the api instance), so Stages 7–8 only need to add parameters. The frontend instance can't read them.

### 4. GitHub repository variables

Settings → Secrets and variables → Actions → **Variables** (not secrets). Values from `terraform output github_variables`, plus:

| Variable                                                                                                                                                  | Source                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`                                                                                                                                     | bootstrap output `deploy_role_arn`          |
| `AWS_PLAN_ROLE_ARN`, `AWS_APPLY_ROLE_ARN`                                                                                                                 | bootstrap `plan_role_arn`, `apply_role_arn` |
| `TF_STATE_BUCKET`                                                                                                                                         | bootstrap output `state_bucket`             |
| `ALERT_EMAIL`                                                                                                                                             | same as `alert_email` in tfvars             |
| `AWS_REGION`, `ECR_API_REPOSITORY_URL`, `ECR_FRONTEND_REPOSITORY_URL`, `ARTIFACTS_BUCKET`, `CLOUDFRONT_DOMAIN`, `API_INSTANCE_ID`, `FRONTEND_INSTANCE_ID` | prod `github_variables`                     |

`*_INSTANCE_ID` changes whenever that instance is replaced; update the variable after that.

### 5. `production` environment (approval gate)

Settings → Environments → **New environment** `production` → **Required reviewers**: add yourself. Under "Deployment branches and tags", allow `main` only. `infra.yml`'s apply job runs in this environment, and only jobs in it can assume `gh-actions-apply`.

### 6. First deploy

Push to `main` (or re-run the latest `Deploy` workflow). The first run takes longer: the instances may still be finishing user data (Docker install) for a few minutes after `apply`.

## Migrating from the single-instance layout

If you applied the earlier layout (S3 web bucket + one instance), `envs/prod/main.tf` has `moved` blocks that keep the api instance (and its Postgres data), the API ECR repo, the distribution and the artifacts bucket. Order matters:

1. `terraform apply` in `bootstrap` (deploy role gets the frontend ECR repo; S3 web-bucket and CloudFront-invalidation permissions are dropped).
2. `terraform plan` in `envs/prod`. Expect: a new frontend instance + `whiteboard-frontend` repo + frontend log group; the api instance's IAM role/profile **replaced** (renamed to `whiteboard-prod-api-*`) while the instance itself is **updated in place**; the web bucket, OAC and SPA function **destroyed**; the distribution updated. If the plan wants to replace `module.api_server.aws_instance.app`, stop.
3. `terraform apply`. Until the first deploy, `/` returns 502 (the frontend instance has no container yet).
4. In GitHub variables: rename `ECR_REPOSITORY_URL` → `ECR_API_REPOSITORY_URL`, `INSTANCE_ID` → `API_INSTANCE_ID`; add `ECR_FRONTEND_REPOSITORY_URL`, `FRONTEND_INSTANCE_ID`; delete `WEB_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `API_LOG_GROUP`.
5. Re-run `Deploy`. On the api instance, `/opt/whiteboard/scripts/` is now unused and can be deleted.

## Stage 9 migration (existing stacks)

The artifacts bucket moves from `envs/prod` state into bootstrap (see [modules/artifacts/README.md](terraform/modules/artifacts/README.md) for why), and CI gets plan/apply roles. From your laptop, in this order:

1. **bootstrap**: adopt the existing bucket, then apply (adds the lifecycle rule, the plan and apply roles):
   ```sh
   cd infra/terraform/bootstrap
   B=whiteboard-prod-artifacts-<account-id>
   terraform import module.artifacts.aws_s3_bucket.artifacts $B
   terraform import module.artifacts.aws_s3_bucket_public_access_block.artifacts $B
   terraform import module.artifacts.aws_s3_bucket_server_side_encryption_configuration.artifacts $B
   terraform apply
   ```
2. **envs/prod**: `terraform plan` should show the bucket as **removed from state only** ("will no longer be managed by Terraform"), never destroyed; new SNS topic, alarms, metric filter, SSM association, EventBridge rule and response headers policy; instance role policies updated in place. Then `terraform apply`, and confirm the SNS email.
3. GitHub: add the variables from step 4 and the `production` environment from step 5.
4. Merge, and let `deploy.yml` copy the new `rollback.sh`/`backup.sh` to the instances. That deploy already saves the tag it replaces to `previous.env`, so it can roll back too.

After step 2 the `removed` block in `envs/prod/main.tf` has done its job and can be deleted.

## Day to day

- Shell on an instance: `aws ssm start-session --target <instance-id>`. There's no SSH key.
- Stack on an instance: `cd /opt/whiteboard && sudo docker compose --env-file deploy.env ps` (same on both).
- Logs: CloudWatch log groups `/whiteboard/prod/api` and `/whiteboard/prod/frontend`.
- Deploys, rollback, backups, restore, secrets, destroy/recreate: see [docs/runbook.md](../docs/runbook.md).
- Migrations must stay **additive** (add a column now, drop it in a later release). A rollback restores the previous image, not the previous schema, so the old code has to work against the new schema.
- Destroy to save credits: `terraform destroy` in `envs/prod`. The artifacts bucket (with `backups/`) lives in bootstrap and survives; take a fresh backup first (runbook).
