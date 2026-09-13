# infra/ — time-boxed AWS deployment (Terraform)

Deploys the same three Docker images to **ECS Fargate**, with **RDS Postgres** (pgvector),
**ElastiCache Redis**, and an **Application Load Balancer**. The plan is: apply, verify, record a
demo, **destroy**. The committed Terraform is the lasting evidence, not the running stack.

```
                 Internet
                    │ :80
             ┌──────▼──────┐
             │     ALB     │  public subnets (2 AZs)
             └──────┬──────┘
                    │
        ┌───────────▼───────────┐     Service Connect DNS: "api", "ai-service"
        │ web (nginx + React)   │───► api ×2 (Express + Socket.io) ───► ai-service
        └───────────────────────┘          │            │
                                           │            │     private subnets
                                   ┌───────▼───┐  ┌─────▼──────┐
                                   │ RDS PG 16 │  │ ElastiCache│
                                   │ +pgvector │  │   Redis    │
                                   └───────────┘  └────────────┘
```

| File | What it creates |
|---|---|
| `network.tf` | VPC, 2 public + 2 private subnets, security groups (no NAT gateway — saves ~$33/mo) |
| `data.tf` | RDS Postgres, ElastiCache Redis, secrets in SSM Parameter Store |
| `ecr.tf` | Private image repositories with scan-on-push |
| `ecs.tf` | Cluster, Service Connect namespace, IAM role, task definitions, services (ARM64) |
| `alb.tf` | Load balancer, target group, listener |
| `budget.tf` | $5 monthly budget with email alerts |

## Cost

AWS has no free tier for Fargate. Rough us-east-1 on-demand prices:

| Resource | ≈ $/hour |
|---|---|
| Fargate ARM: api 2×(0.25 vCPU, 0.5 GB), web 0.25/0.5, ai-service 1/2 GB | 0.069 |
| RDS db.t4g.micro + 20 GB gp3 | 0.018 |
| ElastiCache cache.t4g.micro | 0.016 |
| ALB (base) | 0.023 |
| Public IPv4 addresses (~6) | 0.030 |
| **Total** | **≈ $0.16/hr ≈ $3.80/day** |

Two days ≈ $8, paid from AWS's new-account credits. **Destroy as soon as the demo is recorded.**

## Runbook

**0. Guardrail first.** In the AWS console: Billing → Budgets → create a $5 cost budget with
email alerts. Do this *before* anything else. (`budget.tf` adds one too, but only after the first apply.)

**1. Configure.**
```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # set alert_email
aws configure                                   # or: aws sso login
terraform init
```

**2. Create the repositories first** (images must exist before ECS can start tasks):
```bash
terraform apply -target=aws_ecr_repository.service
```

**3. Build and push the images** (ARM64 — native on an Apple Silicon Mac):
```bash
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY

for svc in api web ai-service; do
  docker build --platform linux/arm64 -t $REGISTRY/ticketboard/$svc:latest ../$svc
  docker push $REGISTRY/ticketboard/$svc:latest
done
```

**4. Apply everything.** (~10–15 min, mostly RDS.)
```bash
terraform apply
```

**5. Verify.** Open the `app_url` output. Healthy targets can take a few minutes after apply.
- Register two users in two browsers, share a board, drag a ticket → it moves in both.
  With 2 API tasks, the browsers are often on *different* tasks, so this exercises the Redis adapter.
- Create a ticket → it gets AI labels/priority.
- Logs: `aws logs tail /ecs/ticketboard/api --follow`

**6. Record evidence.** Screenshot the ECS services page (2 api tasks running), the app, and a
60-second demo video.

**7. Destroy.**
```bash
terraform destroy
```
Then check the console (ECS, RDS, EC2 → Load Balancers) and confirm nothing is left.

## Not verified yet

This configuration passes `terraform validate` but has **not been applied**. Things most likely
to need a tweak on the first real run:
- **Service Connect + nginx:** nginx resolves `api` when it starts. If the web task starts before
  the Service Connect proxy is ready, it exits and ECS restarts it. Expect a restart or two.
- **RDS TLS:** see the comment above `aws_ssm_parameter.database_url`. If `prisma migrate deploy`
  rejects the `uselibpqcompat` parameter, drop it and set `NODE_EXTRA_CA_CERTS` to the RDS CA bundle instead.
