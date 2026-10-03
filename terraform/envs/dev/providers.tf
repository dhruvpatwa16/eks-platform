terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"

  default_tags {
    tags = {
      Project   = "eks-platform"
      ManagedBy = "terraform"
    }
  }
}