# Quickstart: K8s Deployment with CI/CD Pipeline

**Feature**: 005-k8s-deploy-cicd | **Date**: 2026-02-26

## Prerequisites

- Access to the `alkem-io/platform` repository (K8s manifests)
- Access to the `alkem-io/infrastructure-provisioning` repository (Terraform DNS)
- Scaleway API secret key (for container registry access)
- Kubeconfig for the production Kubernetes cluster
- Azure CLI authenticated (`az login`) for Terraform DNS changes
- `kubectl` and `terraform` CLI tools installed

## Setup Steps

### 1. Configure GitHub Secrets

In the `alkem-io/ecosystem-analytics` repository settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `SCW_SECRET_KEY` | Scaleway API secret key |
| `KUBECONFIG` | Raw kubeconfig YAML for production cluster |

### 2. Apply DNS Record

```bash
cd alkem-io/infrastructure-provisioning/azure/dns/production
terraform init
terraform plan    # Verify the ecosystem-analytics A record
terraform apply
```

Verify DNS resolution:
```bash
dig ecosystem-analytics.alkem.io
# Expected: 51.158.216.195
```

### 3. Apply K8s Manifests

```bash
cd alkem-io/platform

# Create namespace first
kubectl apply -f ecosystem-analytics/01-ecosystem-analytics-namespace.yml

# Populate the secret with actual values (NOT from version control)
kubectl create secret generic ecosystem-analytics-secrets \
  --namespace=ecosystem-analytics \
  --from-literal=ALKEMIO_KRATOS_PUBLIC_URL=<ACTUAL_KRATOS_URL> \
  --dry-run=client -o yaml | kubectl apply -f -

# Apply remaining manifests
kubectl apply -f ecosystem-analytics/02-ecosystem-analytics-configmap.yml
kubectl apply -f ecosystem-analytics/04-ecosystem-analytics-deployment.yml
kubectl apply -f ecosystem-analytics/05-ecosystem-analytics-service.yml
kubectl apply -f ecosystem-analytics/06-ecosystem-analytics-ingressroute.yml
```

Or using kustomize from the repo root:
```bash
kubectl apply -k .
```

### 4. Trigger First Deployment

Merge a change to `main` in this repository. The GitHub Actions pipeline will:
1. Build the Docker image from the multi-stage Dockerfile
2. Tag it with `sha-<7-char-commit-sha>`
3. Push to Scaleway Container Registry
4. Update the deployment image via `kubectl set image`

Monitor the pipeline in GitHub Actions.

### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n ecosystem-analytics

# Check deployment rollout
kubectl rollout status deployment/ecosystem-analytics -n ecosystem-analytics

# Check health endpoint
kubectl port-forward -n ecosystem-analytics svc/ecosystem-analytics 4000:80
curl http://localhost:4000/api/health
# Expected: {"status":"ok"}

# Check public access
curl -I https://ecosystem-analytics.alkem.io
# Expected: HTTP/2 200
```

## Validation Checklist

- [ ] DNS: `dig ecosystem-analytics.alkem.io` resolves to `51.158.216.195`
- [ ] TLS: `curl -I https://ecosystem-analytics.alkem.io` returns valid HTTPS response
- [ ] HTTP redirect: `curl -I http://ecosystem-analytics.alkem.io` returns 301 → HTTPS
- [ ] Health: `https://ecosystem-analytics.alkem.io/api/health` returns `{"status":"ok"}`
- [ ] Frontend: Browser loads the SPA at `https://ecosystem-analytics.alkem.io`
- [ ] Auth: Login with Alkemio credentials succeeds
- [ ] Graph: Select a Space and generate a graph — renders correctly
- [ ] Pipeline (PR): Open a PR → build runs, no push, no deploy
- [ ] Pipeline (merge): Merge to `main` → build + push + deploy completes
- [ ] Image tag: Running pod uses `sha-<commit-sha>` image tag
- [ ] Rolling update: Deploy new version — no downtime observed

## Troubleshooting

### Pod not starting
```bash
kubectl describe pod -n ecosystem-analytics -l app=ecosystem-analytics
kubectl logs -n ecosystem-analytics -l app=ecosystem-analytics
```

### Pipeline fails at registry push
- Verify `SCW_SECRET_KEY` is set correctly in GitHub secrets
- Check Scaleway console for registry access permissions

### Pipeline fails at deploy
- Verify `KUBECONFIG` secret contains valid, non-expired kubeconfig
- Check that the kubeconfig has permissions for the `ecosystem-analytics` namespace

### DNS not resolving
- Allow up to 5 minutes for propagation (TTL: 300s)
- Verify with `dig @8.8.8.8 ecosystem-analytics.alkem.io`
- Check Azure DNS portal for the record

### Application loads but auth fails
- Verify `ALKEMIO_KRATOS_PUBLIC_URL` in the K8s secret is correct
- Check pod logs: `kubectl logs -n ecosystem-analytics -l app=ecosystem-analytics`
