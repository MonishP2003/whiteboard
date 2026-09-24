# Runbook

Short procedures for the prod stack. Setup and architecture: [infra/README.md](../infra/README.md).

Placeholders: `<api-id>` / `<frontend-id>` are the `API_INSTANCE_ID` / `FRONTEND_INSTANCE_ID` GitHub variables, `<bucket>` is `ARTIFACTS_BUCKET` (`whiteboard-prod-artifacts-<account-id>`), `<cf>` is `CLOUDFRONT_DOMAIN`.

A shell on an instance: `aws ssm start-session --target <api-id>`, then `sudo -i` and `cd /opt/whiteboard`. Everything below that runs "on the api instance" assumes that.

## Deploy

Merge to `main`. `deploy.yml` builds both images, deploys the API, waits up to 60 s for `https://<cf>/api/health` to return 200 **with the new commit SHA as `version`**, then deploys the frontend.

If the API check fails, the workflow runs `rollback.sh` on the api instance over SSM, checks health again, and **the run goes red either way**. The frontend isn't deployed. If the frontend container fails its `/healthz` check, its `deploy.sh` rolls itself back and the run goes red.

Schema changes must be additive (see [infra/README.md](../infra/README.md#day-to-day)). A rollback puts back the old code, not the old schema.

Infra changes (`infra/terraform/**`) go through `infra.yml`: the PR gets a plan comment; after merge, the plan is in the run's summary and the apply job waits for your approval in the `production` environment. Don't `terraform apply` prod from your laptop except when recreating the stack (below).

## Roll back by hand

Pick one:

- **Redeploy an older commit**: Actions → Deploy → an older green run → **Re-run all jobs**. That run's SHA is deployed again (ECR keeps the last 10 images). This is the normal way.
- **Previous image, right now**: on the instance, `bash rollback.sh`. It swaps `deploy.env` for `previous.env` (the tag before the last deploy) and restarts the service. Works on both instances.
- **Revert**: `git revert` the bad commit and merge; it deploys like any other change.

Check: `curl -s https://<cf>/api/health` shows the `version` you expect.

## Rotate a secret

Secrets live in SSM under `/whiteboard/prod/`; `deploy.sh` writes them into the API's `.env` on every deploy.

```sh
aws ssm put-parameter --overwrite --type SecureString --name /whiteboard/prod/<NAME> --value "<new value>"
```

Then re-run the latest green Deploy run. The api container is recreated with the new value.

- `JWT_SECRET`: everyone is logged out.
- `POSTGRES_PASSWORD`: Postgres only reads it on an empty volume. First change it in the database, then update both parameters, then redeploy:
  ```sh
  # on the api instance
  docker compose --env-file deploy.env exec postgres psql -U whiteboard -c "ALTER USER whiteboard PASSWORD '<new>'"
  ```
  and set `POSTGRES_PASSWORD` and `DATABASE_URL` (`postgresql://whiteboard:<new>@postgres:5432/whiteboard`).
- `RAZORPAY_WEBHOOK_SECRET`: change it on the Razorpay dashboard webhook at the same time.
- `GEMINI_API_KEY`, `RAZORPAY_KEY_*`: rotate at the provider, then here.

## Backups

`backup.sh` runs nightly at 02:00 IST (20:30 UTC) through the SSM association `whiteboard-prod-pg-dump` and writes `s3://<bucket>/backups/<YYYY-MM-DD>.dump` (`pg_dump -Fc`). Objects expire after 14 days. A failed run emails the alerts topic.

- List: `aws s3 ls s3://<bucket>/backups/`
- Run one now: Systems Manager → State Manager → `whiteboard-prod-pg-dump` → **Apply association now**, or on the api instance: `ARTIFACTS_BUCKET=<bucket> bash backup.sh`. A second run on the same day overwrites that day's file.

## Restore a backup

On the api instance, with the stack deployed (Postgres running):

```sh
ARTIFACTS_BUCKET=<bucket> bash restore.sh              # newest backup
ARTIFACTS_BUCKET=<bucket> bash restore.sh 2026-09-23   # a specific day
```

It stops the API, runs `pg_restore --clean --if-exists --single-transaction` (replacing every table, including `_prisma_migrations`), and starts the API again. If the backup is older than the running code's migrations, redeploy afterwards so `prisma migrate deploy` brings the schema forward.

## Destroy and recreate

The artifacts bucket (and so `backups/`) belongs to the bootstrap stack; destroying prod leaves it. Everything else goes: instances, Postgres volume, CloudFront distribution, **and the SSM secrets**.

1. **Back up** (above) and check the file is in S3. Save the secret values you want to keep:
   `aws ssm get-parameters-by-path --path /whiteboard/prod/ --with-decryption`
2. **Destroy** from your laptop: `cd infra/terraform/envs/prod && terraform destroy`.
3. **Recreate**: re-run the latest Infra run on `main` (it plans the whole stack; approve the apply), or `terraform apply` from your laptop.
4. **Secrets**: they're back as `change-me`. Put the real values again ([infra/README.md](../infra/README.md#3-secrets-once-terraform-ignores-later-value-changes)). A new `POSTGRES_PASSWORD` is fine: the volume is new.
5. **GitHub variables**: update `API_INSTANCE_ID`, `FRONTEND_INSTANCE_ID` and `CLOUDFRONT_DOMAIN` from `terraform output github_variables`.
6. **Razorpay**: the webhook URL contains the CloudFront domain; update it on the dashboard.
7. **Deploy**: re-run the latest green Deploy run. Give user data a few minutes first (Docker install).
8. **Restore** the backup (above). Open the site and check a board.
9. **SNS**: the alerts topic is new, so confirm the subscription email again.

## Alarms

All go to the SNS topic `whiteboard-prod-alerts` (email):

| Alarm                            | Fires when                               | Look at                                            |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `whiteboard-prod-api-5xx`        | ≥ 5 responses with status ≥ 500 in 5 min | log group `/whiteboard/prod/api`, `"statusCode":5` |
| `whiteboard-prod-*-status-check` | EC2 status check failing for 5 min       | EC2 console; reboot or `terraform apply -replace`  |
| `whiteboard-prod-*-memory`       | memory > 90% for 15 min                  | `docker stats` on the instance                     |
| `whiteboard-prod-*-disk`         | root volume > 80%                        | `docker system df`; `docker image prune -af`       |
| backup failure (EventBridge)     | the nightly association fails            | State Manager → association → execution history    |

Budgets email directly: over $1 actual/forecast (after credits) and, if `credit_burn_budget_usd` is set, forecast usage before credits above that.

## Drills

Do each once after setting this up.

- **Broken deploy**: merge a commit where `/api/health` returns 500. Expect: the Deploy run is red, its log shows "Rolled back", the site keeps working, `version` is the previous SHA. Revert the commit.
- **5xx alarm**: add a temporary route that throws, hit it 10 times through CloudFront, get the email within ~5 minutes, remove the route.
- **Backup round trip**: create a board, run a backup, destroy → recreate → deploy → restore, and see the board again.
