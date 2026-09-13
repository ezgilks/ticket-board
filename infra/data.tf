# ---- RDS Postgres (pgvector is available on RDS for PostgreSQL 16) -------------------

resource "random_password" "db" {
  length  = 32
  special = false # keeps the connection URL free of characters that need escaping
}

resource "aws_db_subnet_group" "main" {
  name       = var.project
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "postgres" {
  identifier        = var.project
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "ticketboard"
  username = "ticketboard"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.data.id]
  publicly_accessible    = false
  multi_az               = false # demo stack; production would be true

  # Short-lived demo: make `terraform destroy` clean and quick.
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 0
  apply_immediately       = true
}

# ---- ElastiCache Redis ----------------------------------------------------------------

resource "aws_elasticache_subnet_group" "main" {
  name       = var.project
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id         = var.project
  engine             = "redis"
  engine_version     = "7.1"
  node_type          = "cache.t4g.micro"
  num_cache_nodes    = 1
  port               = 6379
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.data.id]
}

# ---- Secrets: stored encrypted in SSM Parameter Store, injected into containers at start.
# They never appear in the task definition. (They do appear in local Terraform state,
# which is gitignored — another reason state belongs in an encrypted S3 bucket for real use.)

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "ai_service_token" {
  length  = 32
  special = false
}

# RDS for PostgreSQL 16 requires TLS. node-postgres treats plain `sslmode=require` as full
# certificate verification, and Node doesn't ship the RDS certificate authority, so it would
# refuse to connect. `uselibpqcompat=true` restores standard libpq behaviour: encrypted, not
# CA-verified — acceptable for traffic that never leaves this private VPC.
resource "aws_ssm_parameter" "database_url" {
  name  = "/${var.project}/DATABASE_URL"
  type  = "SecureString"
  value = "postgresql://${aws_db_instance.postgres.username}:${random_password.db.result}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}?sslmode=require&uselibpqcompat=true"
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project}/JWT_SECRET"
  type  = "SecureString"
  value = random_password.jwt.result
}

resource "aws_ssm_parameter" "ai_service_token" {
  name  = "/${var.project}/AI_SERVICE_TOKEN"
  type  = "SecureString"
  value = random_password.ai_service_token.result
}

resource "aws_ssm_parameter" "gemini_api_key" {
  name  = "/${var.project}/GEMINI_API_KEY"
  type  = "SecureString"
  value = var.gemini_api_key == "" ? "unset" : var.gemini_api_key
}
