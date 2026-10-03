module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = "eks-platform-dev"
  kubernetes_version = "1.34"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  addons = {
    coredns                = {}
    eks-pod-identity-agent = { before_compute = true }
    kube-proxy             = {}
    vpc-cni                = { before_compute = true }
  }

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = ["c7i-flex.large"]

      min_size     = 2
      max_size     = 3
      desired_size = 2
    }
  }
}