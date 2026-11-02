data "aws_iam_policy_document" "task_api_assume" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_api" {
  name               = "eks-platform-dev-task-api"
  assume_role_policy = data.aws_iam_policy_document.task_api_assume.json
}

data "aws_iam_policy_document" "task_api_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.main.master_user_secret[0].secret_arn]
  }
}

resource "aws_iam_role_policy" "task_api_secret" {
  name   = "read-db-secret"
  role   = aws_iam_role.task_api.id
  policy = data.aws_iam_policy_document.task_api_secret.json
}

resource "aws_eks_pod_identity_association" "task_api" {
  cluster_name    = module.eks.cluster_name
  namespace       = "task-api"
  service_account = "task-api"
  role_arn        = aws_iam_role.task_api.arn
}