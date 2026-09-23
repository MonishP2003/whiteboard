# Infrastructure

Two services on two EC2 instances, behind one CloudFront distribution:

| Path     | Origin            | Runs                                                   |
| -------- | ----------------- | ------------------------------------------------------ |
| `/*`     | frontend instance | `whiteboard-frontend` image (Caddy + the React build)  |
| `/api/*` | api instance      | Caddy → `whiteboard-api` image (Fastify) + Postgres 16 |

```
infra/
  terraform/bootstrap/   state bucket, GitHub OIDC, gh-actions-deploy role (local state, apply once)
  terraform/envs/prod/   everything else (S3 backend)
  terraform/modules/     network, registry, compute (x2), artifacts, cdn, observability
  docker/api/            api instance: compose stack + Caddyfile + deploy.sh
  docker/frontend/       frontend instance: compose stack + deploy.sh
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

Keep `terraform.tfstate` somewhere safe (it's gitignored). Outputs: `state_bucket`, `deploy_role_arn`.
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

Confirm the AWS Budgets subscription email when it arrives.

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

Optionally add a plain `/whiteboard/prod/GEMINI_MODEL` parameter to override the default model. Parameter changes take effect on the next deploy (`deploy.sh` rewrites `.env` and recreates the api container).

Postgres only reads `POSTGRES_PASSWORD` when it initialises an empty volume. To rotate it later, `ALTER USER` inside the container as well.

Every parameter under `/whiteboard/prod/` ends up in the API's environment (`/opt/whiteboard/.env` on the api instance), so Stages 7–8 only need to add parameters. The frontend instance can't read them.

### 4. GitHub repository variables

Settings → Secrets and variables → Actions → **Variables** (not secrets). Values from `terraform output github_variables`, plus:

| Variable                                                                                                                                                  | Source                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`                                                                                                                                     | bootstrap output `deploy_role_arn` |
| `AWS_REGION`, `ECR_API_REPOSITORY_URL`, `ECR_FRONTEND_REPOSITORY_URL`, `ARTIFACTS_BUCKET`, `CLOUDFRONT_DOMAIN`, `API_INSTANCE_ID`, `FRONTEND_INSTANCE_ID` | prod `github_variables`            |

`*_INSTANCE_ID` changes whenever that instance is replaced; update the variable after that.

### 5. First deploy

Push to `main` (or re-run the latest `Deploy` workflow). The first run takes longer: the instances may still be finishing user data (Docker install) for a few minutes after `apply`.

## Migrating from the single-instance layout

If you applied the earlier layout (S3 web bucket + one instance), `envs/prod/main.tf` has `moved` blocks that keep the api instance (and its Postgres data), the API ECR repo, the distribution and the artifacts bucket. Order matters:

1. `terraform apply` in `bootstrap` (deploy role gets the frontend ECR repo; S3 web-bucket and CloudFront-invalidation permissions are dropped).
2. `terraform plan` in `envs/prod`. Expect: a new frontend instance + `whiteboard-frontend` repo + frontend log group; the api instance's IAM role/profile **replaced** (renamed to `whiteboard-prod-api-*`) while the instance itself is **updated in place**; the web bucket, OAC and SPA function **destroyed**; the distribution updated. If the plan wants to replace `module.api_server.aws_instance.app`, stop.
3. `terraform apply`. Until the first deploy, `/` returns 502 (the frontend instance has no container yet).
4. In GitHub variables: rename `ECR_REPOSITORY_URL` → `ECR_API_REPOSITORY_URL`, `INSTANCE_ID` → `API_INSTANCE_ID`; add `ECR_FRONTEND_REPOSITORY_URL`, `FRONTEND_INSTANCE_ID`; delete `WEB_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `API_LOG_GROUP`.
5. Re-run `Deploy`. On the api instance, `/opt/whiteboard/scripts/` is now unused and can be deleted.

## Day to day

- Shell on an instance: `aws ssm start-session --target <instance-id>`. There's no SSH key.
- Stack on an instance: `cd /opt/whiteboard && sudo docker compose --env-file deploy.env ps` (same on both).
- Logs: CloudWatch log groups `/whiteboard/prod/api` and `/whiteboard/prod/frontend`.
- Destroy to save credits: `terraform destroy` in `envs/prod` (Postgres data goes with the api instance until Stage 9 adds backups). Bootstrap stays.
