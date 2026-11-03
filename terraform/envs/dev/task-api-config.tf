provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

resource "kubernetes_namespace_v1" "task_api" {
  metadata {
    name = "task-api"
  }

  depends_on = [module.eks]
}

resource "kubernetes_config_map_v1" "task_api" {
  metadata {
    name      = "task-api-config"
    namespace = kubernetes_namespace_v1.task_api.metadata[0].name
  }

  data = {
    DB_HOST       = aws_db_instance.main.address
    DB_PORT       = "5432"
    DB_NAME       = "tasks"
    DB_SECRET_ARN = aws_db_instance.main.master_user_secret[0].secret_arn
    DB_SSL        = "true"
    AWS_REGION    = "ap-south-1"
  }
}