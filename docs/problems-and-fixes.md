# Problems hit and how they were fixed

Real issues from building this project, in the order they came up.

## 1. The AWS CLI was using root credentials

- **Symptom:** `aws sts get-caller-identity` returned an ARN ending in `:root`.
- **Why it matters:** root has unrestricted access to the whole account and can't be limited. A leaked key would mean full account takeover.
- **Fix:** created a dedicated IAM user for the project with its own CLI profile, deleted the root access keys, and confirmed MFA on the root user. All Terraform runs use the project profile.

## 2. EKS node group failed on the Free plan

- **Symptom:** the node group went to `CREATE_FAILED` with `InvalidParameterCombination: The specified instance type is not eligible for Free Tier`.
- **Cause:** the account was on the AWS Free plan, which only allows free-tier-eligible instance types, and `t3.medium` isn't one of them.
- **Fix:** listed the allowed types with `aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true`, then chose `c7i-flex.large` (2 vCPU, 4 GB). The small types were rejected because EKS system pods plus the add-ons would nearly fill them. Re-applying replaced only the failed node group. The account was later upgraded to the Paid plan, and the credits carried over.

## 3. GitHub Actions couldn't assume the AWS role (OIDC)

- **Symptom:** `Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`.
- **Investigation:** the trust policy looked correct, so a temporary workflow step decoded the OIDC token and printed its non-secret claims.
- **Cause:** GitHub's token `sub` claim now includes numeric IDs for the account and the repo (`repo:<owner>@<id>/<repo>@<id>:ref:refs/heads/main`), so the policy's `sub` condition, written with plain names, never matched.
- **Fix:** updated the trust policy's `sub` condition to the exact value GitHub sends, then removed the debug step. The role is still restricted to this one repo and the `main` branch.

## 4. Pushes rejected after CI started committing to the repo

- **Symptom:** `git push` failed with `non-fast-forward` (the remote was ahead).
- **Cause:** the workflow's bot commits the new image tag, so the remote moves ahead of the local copy.
- **Fix:** fetched and compared the histories before changing anything, then used `git pull --rebase`. The build workflow itself also does `git pull --rebase` before pushing its commit. Never force-push in this setup. The habit is to pull before starting new work after any CI run.

## 5. Configuration values that only exist after the database is created

- **Problem:** the app needs the RDS address and the secret's ARN, which change on every rebuild, so they can't be hardcoded in the manifests Argo CD syncs from git.
- **Fix:** Terraform owns the namespace and the ConfigMap and fills the values from the database resource's attributes. Argo CD owns everything else in `gitops/`. A rebuild needs no manual copy-and-paste.

## 6. The ALB isn't managed by Terraform

- **Risk:** the Ingress makes the AWS Load Balancer Controller create an ALB that Terraform doesn't know about. Running `terraform destroy` with it still present leaves the ALB behind and blocks the VPC deletion.
- **Fix:** a fixed teardown order. Delete the Argo CD Application first (it has a cleanup finalizer, so it removes the Ingress and therefore the ALB), wait until `aws elbv2 describe-load-balancers` is empty, then `terraform destroy`. After every session, a final check confirms no clusters, databases, NAT gateways, load balancers or Elastic IPs are left billing.

## 7. A healthy pod doesn't prove the database works

- **Problem:** `/health` always returns 200 on purpose, so a database failure doesn't restart the pods in a loop, and Kubernetes showed `1/1 Running` either way.
- **Fix:** `/health` reports the database state in its body (`"db":"up"` or `"down"`), and verification checks that body from inside a pod and through the ALB. That proved the whole chain: Pod Identity credentials, then Secrets Manager, then RDS.

## 8. A development machine without Docker or a kubectl installer

- **Problem:** no local Docker, and kubectl couldn't be installed the usual way.
- **Fix:** images are built in GitHub Actions, which is where they belong anyway. kubectl runs as a standalone `kubectl.exe` that needs no installer.

## Known open items

- The container runs Node 20, and the AWS SDK warns that newer releases will need Node 22 or later. Planned: move the Dockerfile to Node 22.
- `npm audit` reports 2 vulnerabilities in the app's dependencies, still to be reviewed.
- The ECR image scan results haven't been reviewed yet.