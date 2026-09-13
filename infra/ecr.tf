# One private image repository per service. Images are built and pushed by hand (see README).

locals {
  services = ["api", "web", "ai-service"]
}

resource "aws_ecr_repository" "service" {
  for_each             = toset(local.services)
  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # let `terraform destroy` remove repos that still hold images

  image_scanning_configuration {
    scan_on_push = true # free basic vulnerability scan of every pushed image
  }
}

resource "aws_ecr_lifecycle_policy" "keep_recent" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 5 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}
