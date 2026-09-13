terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State is local on purpose: this stack lives for a day or two, then `terraform destroy`.
  # For a long-lived stack you'd store state in S3 with locking so a team can share it.
}

provider "aws" {
  region = var.region

  # Every resource gets these tags — makes the bill and the console easy to filter.
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
