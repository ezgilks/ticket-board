# ---------------------------------------------------------------------------------------
# ECS Fargate: runs the three containers without managing servers.
#
# Service Connect gives each service a DNS name inside the cluster — "api", "ai-service" —
# the same names Docker Compose uses. So the web image's nginx.conf (proxy_pass http://api:3000)
# and the API's AI_SERVICE_URL (http://ai-service:8001) work unchanged in AWS.
# ---------------------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = var.project

  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.main.arn
  }
}

resource "aws_service_discovery_http_namespace" "main" {
  name = var.project
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = toset(local.services)
  name              = "/ecs/${var.project}/${each.key}"
  retention_in_days = 3
}

# ---- IAM: the execution role lets ECS pull images, write logs, and read our secrets ----

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.project}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  # Least privilege: only this project's parameters, nothing else in the account.
  statement {
    actions   = ["ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project}/*"]
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role_policy" "read_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

# ---- Task definitions ------------------------------------------------------------------

locals {
  image = { for s in local.services : s => "${aws_ecr_repository.service[s].repository_url}:${var.image_tag}" }

  log_config = {
    for s in local.services : s => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[s].name
        awslogs-region        = var.region
        awslogs-stream-prefix = s
      }
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  # ARM (Graviton): ~20% cheaper than x86, and matches images built on an Apple Silicon Mac.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = local.image["api"]
    essential    = true
    portMappings = [{ name = "api", containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
      { name = "AI_SERVICE_URL", value = "http://ai-service:8001" },
      { name = "CORS_ORIGIN", value = "http://${aws_lb.main.dns_name}" },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.jwt_secret.arn },
      { name = "AI_SERVICE_TOKEN", valueFrom = aws_ssm_parameter.ai_service_token.arn },
    ]
    logConfiguration = local.log_config["api"]
  }])
}

resource "aws_ecs_task_definition" "ai_service" {
  family                   = "${var.project}-ai-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048 # PyTorch + model ≈ 400MB; headroom for encoding bursts
  execution_role_arn       = aws_iam_role.execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name         = "ai-service"
    image        = local.image["ai-service"]
    essential    = true
    portMappings = [{ name = "ai", containerPort = 8001, protocol = "tcp" }]
    environment  = [{ name = "TRIAGE_PROVIDER", value = var.gemini_api_key == "" ? "keyword" : "auto" }]
    secrets = [
      { name = "AI_SERVICE_TOKEN", valueFrom = aws_ssm_parameter.ai_service_token.arn },
      { name = "GEMINI_API_KEY", valueFrom = aws_ssm_parameter.gemini_api_key.arn },
    ]
    logConfiguration = local.log_config["ai-service"]
  }])
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name             = "web"
    image            = local.image["web"]
    essential        = true
    portMappings     = [{ name = "web", containerPort = 80, protocol = "tcp" }]
    logConfiguration = local.log_config["web"]
  }])
}

# ---- Services: keep N copies of each task running --------------------------------------

resource "aws_ecs_service" "ai_service" {
  name            = "ai-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_service.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  service_connect_configuration {
    enabled = true
    service {
      port_name      = "ai"
      discovery_name = "ai-service"
      client_alias {
        dns_name = "ai-service"
        port     = 8001
      }
    }
  }
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  # Both API tasks run `prisma migrate deploy` on boot. That's safe: Prisma takes a Postgres
  # advisory lock, so one task migrates while the other waits.
  service_connect_configuration {
    enabled = true
    service {
      port_name      = "api"
      discovery_name = "api"
      client_alias {
        dns_name = "api"
        port     = 3000
      }
    }
  }

  depends_on = [aws_ecs_service.ai_service]
}

resource "aws_ecs_service" "web" {
  name            = "web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 80
  }

  # Client-only: web resolves "api" through Service Connect but exposes no name itself.
  service_connect_configuration {
    enabled = true
  }

  depends_on = [aws_ecs_service.api, aws_lb_listener.http]
}
