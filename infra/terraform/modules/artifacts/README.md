# artifacts module

One private S3 bucket, `whiteboard-prod-artifacts-<account-id>`:

| Prefix                | Written by                               | Read by                                   |
| --------------------- | ---------------------------------------- | ----------------------------------------- |
| `deploy/api/`         | `deploy.yml` (gh-actions-deploy role)    | api instance, synced to `/opt/whiteboard` |
| `deploy/frontend/`    | `deploy.yml`                             | frontend instance                         |
| `backups/<date>.dump` | `backup.sh` on the api instance, nightly | `restore.sh` on the api instance          |

`backups/` expires after 14 days (`backup_retention_days`). Each instance's role is limited to its own prefixes (see `modules/compute`); the frontend instance can't read `backups/`.

## Why it lives in bootstrap, not envs/prod

The bucket holds the only copy of the database once the api instance is gone, so it must survive `terraform destroy` of `envs/prod` (the nightly-destroy pattern). Two options were on the table:

1. **Move it to the bootstrap stack** ← chosen
2. Keep it in prod with `lifecycle { prevent_destroy = true }` and destroy everything else with `-target`

Option 2 turns every destroy into a hand-written list of targets that goes stale as modules are added, and a plain `terraform destroy` just errors. With option 1, `envs/prod` only looks the bucket up (`data "aws_s3_bucket" "artifacts"`), so a plain `terraform destroy` there leaves it alone. `force_destroy = false` is a second guard: even bootstrap can't delete it while it has objects.

Bootstrap already derived the bucket name for the deploy role's policy, so nothing about the name changes.

Migrating an existing bucket from prod state into bootstrap: see "Stage 9 migration" in [`infra/README.md`](../../../README.md).
