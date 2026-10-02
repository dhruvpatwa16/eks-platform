terraform {
  required_version = ">= 1.10"

  backend "s3" {
    bucket       = "eks-platform-tfstate-499937073132"
    key          = "eks/dev/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}