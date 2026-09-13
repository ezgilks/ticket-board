output "app_url" {
  description = "Open this in a browser once the services are healthy."
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_repositories" {
  description = "Push images here (see README)."
  value       = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

output "logs" {
  value = { for k, g in aws_cloudwatch_log_group.service : k => g.name }
}
