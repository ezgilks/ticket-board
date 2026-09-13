# ---------------------------------------------------------------------------------------
# Application Load Balancer: the single public entry point. It forwards to the web task
# (nginx), which serves the React app and proxies /api, /socket.io and /graphql to the API.
#
# WebSockets: the ALB supports them natively. The web client uses the websocket transport
# only (no HTTP long-polling), so the 2 API tasks need no sticky sessions — cross-task
# delivery is the Redis adapter's job.
#
# HTTP only: HTTPS needs a domain for an ACM certificate. Fine for a time-boxed demo;
# a real deployment adds a 443 listener and redirects 80 → 443.
# ---------------------------------------------------------------------------------------

resource "aws_lb" "main" {
  name               = var.project
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]
  idle_timeout       = 120 # keep idle WebSocket connections open longer than the 60s default
}

resource "aws_lb_target_group" "web" {
  name        = "${var.project}-web"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # required for Fargate (awsvpc networking)

  health_check {
    path                = "/api/health" # checks nginx AND its proxy to the API in one probe
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 10
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
