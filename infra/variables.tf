variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "ticketboard"
}

variable "alert_email" {
  description = "Where the budget alarm emails go."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Budget alarm threshold. Fires at 80% actual and 100% forecasted."
  type        = number
  default     = 5
}

variable "image_tag" {
  description = "Tag of the images pushed to ECR (see README)."
  type        = string
  default     = "latest"
}

variable "api_desired_count" {
  description = "API tasks. 2 on purpose: proves Socket.io events cross instances via the Redis adapter."
  type        = number
  default     = 2
}

variable "gemini_api_key" {
  description = "Optional free Gemini key for LLM triage. Empty = keyword rules."
  type        = string
  default     = ""
  sensitive   = true
}
