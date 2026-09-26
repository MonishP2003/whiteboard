# whiteboard

This guide covers deploying whiteboard to production and keeping it running, from an empty AWS account to a live site.

- [Architecture](#architecture)
- [Part 1: first-time production setup](#part-1-first-time-production-setup) (steps 1–8, done once)
- [Part 2: deploying changes](#part-2-deploying-changes) (every release)
- [Part 3: operations](#part-3-operations): rollback, secrets, backups, restore, destroy/recreate, alarms
- [Appendix: migrating older stacks](#appendix-migrating-older-stacks)

## Architecture

There are two services on two EC2 instances, both behind one CloudFront distribution:

| Path     | Origin            | Runs                                                   |
| -------- | ----------------- | ------------------------------------------------------ |
| `/*`     | frontend instance | `whiteboard-frontend` image (Caddy + the React build)  |
| `/api/*` | api instance      | Caddy → `whiteboard-api` image (Fastify) + Postgres 16 |

```
.github/workflows/
  ci.yml       tests and lint
  deploy.yml   builds images and deploys on every push to main
  infra.yml    Terraform plan on PRs, then apply after approval
infra/
  terraform/bootstrap/   state bucket, artifacts bucket, GitHub OIDC, CI roles (local state, applied by hand)
  terraform/envs/prod/   everything else (S3 backend; applied by infra.yml)
  terraform/modules/     network, registry, compute (x2), artifacts, cdn, observability, backup
  docker/api/            api instance: compose stack, Caddyfile, deploy/rollback/backup/restore.sh
  docker/frontend/       frontend instance: compose stack, deploy.sh, rollback.sh
  docker/docker-compose.dev.yml   local Postgres only
```

The region defaults to `ap-south-1`. To use a different one, change `region` in both Terraform stacks and in `backend.hcl`.

### The artifacts bucket

The artifacts bucket is one private S3 bucket named `whiteboard-prod-artifacts-<account-id>`:

| Prefix                | Written by                                 | Read by                                   |
| --------------------- | ------------------------------------------ | ----------------------------------------- |
| `deploy/api/`         | `deploy.yml` (the `gh-actions-deploy` role) | api instance, synced to `/opt/whiteboard` |
| `deploy/frontend/`    | `deploy.yml`                               | frontend instance                         |
| `backups/<date>.dump` | `backup.sh` on the api instance, nightly   | `restore.sh` on the api instance          |

`backups/` expires after 14 days (`backup_retention_days`). Each instance's role can only reach its own prefixes, so the frontend instance can't read `backups/`.

The bucket belongs to the **bootstrap** stack rather than `envs/prod`. Once the api instance is gone, this bucket holds the only copy of the database, so it has to survive `terraform destroy` of prod. `envs/prod` only looks the bucket up (`data "aws_s3_bucket" "artifacts"`), which means a plain `terraform destroy` leaves it alone. `force_destroy = false` adds a second guard: even bootstrap can't delete the bucket while it holds objects. The alternative was keeping the bucket in prod with `prevent_destroy` and destroying everything else with `-target`. That was rejected because every destroy would need a hand-written target list that goes stale as modules are added.

---

## Part 1: first-time production setup

### Prerequisites

- Terraform ≥ 1.10
- AWS CLI v2 and the Session Manager plugin
- Admin AWS credentials on your laptop
- Admin access to the GitHub repository

### Step 1: Bootstrap the account (once)

```sh
cd infra/terraform/bootstrap
terraform init
terraform apply
```

If the account already has a GitHub OIDC provider, import it before running `apply`:

```sh
terraform import aws_iam_openid_connect_provider.github arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com
```

Keep `terraform.tfstate` somewhere safe. It is gitignored, and this stack uses local state.

Note these outputs; you'll need them in step 5: `state_bucket`, `artifacts_bucket`, `deploy_role_arn`, `plan_role_arn`, `apply_role_arn`.

Bootstrap creates these CI roles. All of them use GitHub OIDC, so no AWS keys are stored in GitHub:

| Role                | Assumable by                                | Can                                            |
| ------------------- | ------------------------------------------- | ---------------------------------------------- |
| `gh-actions-deploy` | the `main` branch (`deploy.yml`)            | push images, run SSM commands, write `deploy/` |
| `gh-actions-plan`   | pull requests and `main` (`infra.yml` plan) | `ReadOnlyAccess`, except `backups/`            |
| `gh-actions-apply`  | the `production` environment (`infra.yml`)  | `PowerUserAccess` + IAM on `whiteboard-prod-*` |

### Step 2: Create the prod stack

```sh
cd infra/terraform/envs/prod
cp backend.hcl.example backend.hcl            # set bucket = bootstrap's state_bucket
cp terraform.tfvars.example terraform.tfvars  # set the alert email
terraform init -backend-config=backend.hcl
terraform apply
```

This first `apply` is the only time you apply prod from your laptop. After this, `infra.yml` applies prod. If you and CI both run `terraform apply`, you will conflict over state.

### Step 3: Confirm the alerts email

Watch for an email titled "AWS Notification - Subscription Confirmation" and confirm it. Until you do, alarms and backup failures send nowhere. Budget alerts are sent directly and don't need confirmation.

### Step 4: Store the secrets in SSM

Terraform creates these parameters with placeholder values and ignores later changes to them, so set the real values once:

```sh
PW=$(openssl rand -hex 24)
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/POSTGRES_PASSWORD --value "$PW"
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/DATABASE_URL \
  --value "postgresql://whiteboard:$PW@postgres:5432/whiteboard"
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/JWT_SECRET \
  --value "$(openssl rand -hex 32)"

# Google AI Studio key. The AI routes return 503 until it's set.
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/GEMINI_API_KEY \
  --value "<key from https://aistudio.google.com/apikey>"

# Razorpay, test mode only. Test and live keys and webhook secrets are different.
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/RAZORPAY_KEY_ID         --value "rzp_test_..."
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/RAZORPAY_KEY_SECRET     --value "<test key secret>"
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/RAZORPAY_WEBHOOK_SECRET --value "$(openssl rand -hex 32)"
```

To override the default Gemini model, you can also add a plain `/whiteboard/prod/GEMINI_MODEL` parameter.

How these secrets reach the API:

- Every parameter under `/whiteboard/prod/` is copied into the API's environment (`/opt/whiteboard/.env` on the api instance) on each deploy. `deploy.sh` rewrites `.env` and recreates the api container, so a parameter change takes effect on the next deploy.
- The frontend instance can't read these parameters.
- Postgres reads `POSTGRES_PASSWORD` only when it initializes an empty volume. To change it later, see [Rotate a secret](#rotate-a-secret).

### Step 5: Set the GitHub repository variables

In GitHub, go to Settings → Secrets and variables → Actions → **Variables**. Use the Variables tab, not Secrets. Run `terraform output github_variables` in `envs/prod` to get most of the values:

| Variable                                                                                                                                                  | Source                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`                                                                                                                                     | bootstrap output `deploy_role_arn`          |
| `AWS_PLAN_ROLE_ARN`, `AWS_APPLY_ROLE_ARN`                                                                                                                 | bootstrap `plan_role_arn`, `apply_role_arn` |
| `TF_STATE_BUCKET`                                                                                                                                         | bootstrap output `state_bucket`             |
| `ALERT_EMAIL`                                                                                                                                             | same as `alert_email` in tfvars             |
| `AWS_REGION`, `ECR_API_REPOSITORY_URL`, `ECR_FRONTEND_REPOSITORY_URL`, `ARTIFACTS_BUCKET`, `CLOUDFRONT_DOMAIN`, `API_INSTANCE_ID`, `FRONTEND_INSTANCE_ID` | prod `github_variables`                     |

When an instance is replaced, its instance ID changes. Update `API_INSTANCE_ID` or `FRONTEND_INSTANCE_ID` whenever that happens.

### Step 6: Create the `production` environment (the approval gate)

In GitHub, go to Settings → Environments → **New environment** and name it `production`. Then:

- Under **Required reviewers**, add yourself.
- Under "Deployment branches and tags", allow `main` only.

The apply job in `infra.yml` runs in this environment, and only jobs in this environment can assume `gh-actions-apply`.

### Step 7: Configure the Razorpay webhook

1. In the Razorpay dashboard, go to Test Mode → Account & Settings → Webhooks.
2. Add a webhook to `https://<CLOUDFRONT_DOMAIN>/api/payments/webhook` for the `payment.captured` and `payment.failed` events.
3. Use the same secret you stored as `RAZORPAY_WEBHOOK_SECRET`.

The signature arrives in the `X-Razorpay-Signature` header. CloudFront forwards that header only because the `/api/*` behaviour uses `AllViewerExceptHostHeader`. If you ever tighten the origin request policy, make sure that header still gets through.

For local testing, note that Razorpay can't reach `localhost`. Run a tunnel (`cloudflared tunnel --url http://localhost:5173`) and point a second test-mode webhook at `<tunnel>/api/payments/webhook`. The integration tests sign their fixture bodies themselves, so they need neither.

### Step 8: Run the first deploy

Push to `main`, or re-run the latest **Deploy** workflow. The first run can take longer, because the instances may still be installing Docker (EC2 user data) for a few minutes after `apply`.

Then check the deploy:

```sh
curl -s https://<CLOUDFRONT_DOMAIN>/api/health   # "version" should be the deployed commit SHA
```

Once the site is up, run each [drill](#drills) once.

---

## Part 2: deploying changes

### Application changes

To deploy, merge to `main`. `.github/workflows/deploy.yml` then does the following:

1. Builds the `api` and `frontend` images for arm64 and pushes them to ECR, tagged with the commit SHA.
2. **Deploys the API.** It uploads `infra/docker/api/` to `s3://<artifacts>/deploy/api/`, then runs `deploy.sh` on the api instance over SSM. `deploy.sh` also runs the database migrations.
3. **Checks the API.** It waits up to 60 s for `https://<cf>/api/health` to return 200 **with the new commit SHA as `version`**. A plain 200 isn't enough, because the old container keeps answering if the new one never starts.
4. **Rolls back on failure.** If the check fails, the workflow runs `rollback.sh` on the api instance and checks health again. The run goes red either way, and the frontend isn't deployed.
5. **Deploys the frontend**, only if the API step passed, then checks the site through CloudFront. If the frontend container fails its `/healthz` check, the frontend's `deploy.sh` rolls itself back and the run goes red.

Deploys are serialized: if two merges land close together, the second deploy waits for the first to finish.

**Migrations must be additive.** For example, add a column in one release and drop it in a later release. A rollback restores the previous image but not the previous schema, so the old code has to work against the new schema.

### Infrastructure changes

Changes under `infra/terraform/**` go through `.github/workflows/infra.yml`:

1. The PR gets a comment with the Terraform plan.
2. After merge, the plan appears in the run's summary, and the apply job waits for your approval in the `production` environment.

Don't run `terraform apply` for prod from your laptop, except when recreating the stack (see [Destroy and recreate](#destroy-and-recreate)).

---

## Part 3: operations

Placeholders used below:

- `<api-id>` / `<frontend-id>`: the `API_INSTANCE_ID` / `FRONTEND_INSTANCE_ID` GitHub variables
- `<bucket>`: `ARTIFACTS_BUCKET`
- `<cf>`: `CLOUDFRONT_DOMAIN`

**Getting a shell on an instance:** run `aws ssm start-session --target <api-id>`, then `sudo -i` and `cd /opt/whiteboard`. There's no SSH key. Steps below that run "on the api instance" assume you've done this.

- To see the stack on either instance: `docker compose --env-file deploy.env ps`
- Logs are in the CloudWatch log groups `/whiteboard/prod/api` and `/whiteboard/prod/frontend`.

### Roll back by hand

Pick one of these:

- **Redeploy an older commit.** This is the normal way. Go to Actions → Deploy, open an older green run, and choose **Re-run all jobs**. That run's SHA is deployed again; ECR keeps the last 10 images.
- **Restore the previous image immediately.** On the instance, run `bash rollback.sh`. It swaps `deploy.env` for `previous.env` (the tag from before the last deploy) and restarts the service. This works on both instances.
- **Revert the commit.** `git revert` the bad commit and merge. The revert deploys like any other change.

To check the result, run `curl -s https://<cf>/api/health` and confirm it shows the `version` you expect.

### Rotate a secret

```sh
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/<NAME> --value "<new value>"
```

Then re-run the latest green Deploy run. That recreates the api container with the new value.

Some secrets need extra steps:

- **`JWT_SECRET`:** rotating it logs everyone out.
- **`POSTGRES_PASSWORD`:** Postgres reads it only on an empty volume, so change the password in the database first. On the api instance, run:
  ```sh
  docker compose --env-file deploy.env exec postgres psql -U whiteboard -c "ALTER USER whiteboard PASSWORD '<new>'"
  ```
  Then set both `POSTGRES_PASSWORD` and `DATABASE_URL` (`postgresql://whiteboard:<new>@postgres:5432/whiteboard`), and redeploy.
- **`RAZORPAY_WEBHOOK_SECRET`:** change the secret on the Razorpay dashboard webhook at the same time.
- **`GEMINI_API_KEY`, `RAZORPAY_KEY_*`:** rotate the key at the provider first, then update it here.

### Backups

`backup.sh` runs nightly at 02:00 IST (20:30 UTC) through the SSM association `whiteboard-prod-pg-dump`. Each run writes `s3://<bucket>/backups/<YYYY-MM-DD>.dump` (`pg_dump -Fc`). Objects expire after 14 days, and a failed run emails the alerts topic.

- To list backups: `aws s3 ls s3://<bucket>/backups/`
- To run a backup now: go to Systems Manager → State Manager → `whiteboard-prod-pg-dump` → **Apply association now**. Alternatively, on the api instance, run `ARTIFACTS_BUCKET=<bucket> bash backup.sh`. A second run on the same day overwrites that day's file.

### Restore a backup

Run this on the api instance while the stack is deployed and Postgres is running:

```sh
ARTIFACTS_BUCKET=<bucket> bash restore.sh              # newest backup
ARTIFACTS_BUCKET=<bucket> bash restore.sh 2026-09-23   # a specific day
```

The script stops the API, runs `pg_restore --clean --if-exists --single-transaction`, and starts the API again. The restore replaces every table, including `_prisma_migrations`. If the backup is older than the running code's migrations, redeploy afterwards so that `prisma migrate deploy` brings the schema forward.

### Destroy and recreate

You can destroy prod to save credits. The artifacts bucket, including `backups/`, belongs to the bootstrap stack and survives. Everything else is deleted: the instances, the Postgres volume, the CloudFront distribution, **and the SSM secrets**.

1. **Back up.** Run a backup (see [Backups](#backups)) and check that the file is in S3. Save any secret values you want to keep:
   `aws ssm get-parameters-by-path --path /whiteboard/prod/ --with-decryption`
2. **Destroy** from your laptop: `cd infra/terraform/envs/prod && terraform destroy`.
3. **Recreate.** Re-run the latest Infra run on `main`, which plans the whole stack, and approve the apply. You can also run `terraform apply` from your laptop.
4. **Restore the secrets.** They come back as `change-me`, so set the real values again ([step 4](#step-4-store-the-secrets-in-ssm)). A new `POSTGRES_PASSWORD` is fine, because the volume is new.
5. **Update the GitHub variables.** Set `API_INSTANCE_ID`, `FRONTEND_INSTANCE_ID` and `CLOUDFRONT_DOMAIN` from `terraform output github_variables`.
6. **Update Razorpay.** The webhook URL contains the CloudFront domain, so update it on the dashboard.
7. **Deploy.** Wait a few minutes for EC2 user data (the Docker install), then re-run the latest green Deploy run.
8. **Restore the backup** (see [Restore a backup](#restore-a-backup)). Open the site and check that a board loads.
9. **Confirm the SNS email.** The alerts topic is new, so confirm the subscription email again.

### Alarms

All alarms go to the SNS topic `whiteboard-prod-alerts` by email:

| Alarm                            | Fires when                                | Look at                                            |
| -------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `whiteboard-prod-api-5xx`        | ≥ 5 responses with status ≥ 500 in 5 min  | log group `/whiteboard/prod/api`, `"statusCode":5` |
| `whiteboard-prod-*-status-check` | the EC2 status check fails for 5 min      | EC2 console; reboot or `terraform apply -replace`  |
| `whiteboard-prod-*-memory`       | memory > 90% for 15 min                   | `docker stats` on the instance                     |
| `whiteboard-prod-*-disk`         | the root volume is > 80% full             | `docker system df`; `docker image prune -af`       |
| backup failure (EventBridge)     | the nightly association fails             | State Manager → association → execution history    |

Budget alerts are emailed directly. One fires when actual or forecast spend (after credits) goes over $1. If `credit_burn_budget_usd` is set, another fires when forecast usage before credits goes above that amount.

### Drills

Run each of these once after setup:

- **Broken deploy:** Merge a commit where `/api/health` returns 500. Expected result: the Deploy run is red, its log shows "Rolled back", the site keeps working, and `version` is still the previous SHA. Revert the commit afterwards.
- **5xx alarm:** Add a temporary route that throws, and hit it 10 times through CloudFront. You should get the alarm email within about 5 minutes. Remove the route afterwards.
- **Backup round trip:** Create a board and run a backup. Then destroy, recreate, deploy and restore, and check that the board is back.

---

## Appendix: migrating older stacks

This appendix applies only if you set up prod with an earlier layout. Skip it for fresh setups.

### From the single-instance layout

If you applied the earlier layout (an S3 web bucket and one instance), `envs/prod/main.tf` has `moved` blocks that keep the api instance and its Postgres data, the API ECR repo, the distribution and the artifacts bucket. Do these steps in order:

1. Run `terraform apply` in `bootstrap`. The deploy role gains the frontend ECR repo and loses the S3 web-bucket and CloudFront-invalidation permissions.
2. Run `terraform plan` in `envs/prod` and check it against this list:
   - Created: a frontend instance, the `whiteboard-frontend` repo and a frontend log group.
   - Replaced: the api instance's IAM role and profile, renamed to `whiteboard-prod-api-*`. The instance itself should be **updated in place**.
   - Destroyed: the web bucket, OAC and SPA function.
   - Updated: the distribution.

   **If the plan wants to replace `module.api_server.aws_instance.app`, stop.**
3. Run `terraform apply`. Until the first deploy, `/` returns 502, because the frontend instance has no container yet.
4. Update the GitHub variables:
   - Rename `ECR_REPOSITORY_URL` to `ECR_API_REPOSITORY_URL`, and `INSTANCE_ID` to `API_INSTANCE_ID`.
   - Add `ECR_FRONTEND_REPOSITORY_URL` and `FRONTEND_INSTANCE_ID`.
   - Delete `WEB_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID` and `API_LOG_GROUP`.
5. Re-run Deploy. On the api instance, `/opt/whiteboard/scripts/` is no longer used and can be deleted.

### Moving the artifacts bucket into bootstrap (Stage 9)

This migration moves the artifacts bucket from `envs/prod` state into bootstrap (see [The artifacts bucket](#the-artifacts-bucket) for why), and gives CI its plan and apply roles. Run these steps from your laptop, in this order:

1. **In bootstrap**, adopt the existing bucket, then apply. This adds the lifecycle rule and the plan and apply roles:
   ```sh
   cd infra/terraform/bootstrap
   B=whiteboard-prod-artifacts-<account-id>
   terraform import module.artifacts.aws_s3_bucket.artifacts $B
   terraform import module.artifacts.aws_s3_bucket_public_access_block.artifacts $B
   terraform import module.artifacts.aws_s3_bucket_server_side_encryption_configuration.artifacts $B
   terraform apply
   ```
2. **In envs/prod**, run `terraform plan` and check it:
   - The bucket should appear as **removed from state only** ("will no longer be managed by Terraform"). It must never be destroyed.
   - New: an SNS topic, alarms, a metric filter, an SSM association, an EventBridge rule and a response headers policy.
   - Updated in place: the instance role policies.

   Then run `terraform apply` and confirm the SNS email.
3. **In GitHub**, add the variables from [step 5](#step-5-set-the-github-repository-variables) and the `production` environment from [step 6](#step-6-create-the-production-environment-the-approval-gate).
4. **Merge**, and let `deploy.yml` copy the new `rollback.sh` and `backup.sh` to the instances. That deploy already saves the tag it replaces to `previous.env`, so rollback works from then on.

After step 2, the `removed` block in `envs/prod/main.tf` has done its job and can be deleted.
