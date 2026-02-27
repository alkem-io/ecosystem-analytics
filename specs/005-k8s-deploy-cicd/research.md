# Research: K8s Deployment with CI/CD Pipeline

**Feature**: 005-k8s-deploy-cicd | **Date**: 2026-02-26

## R1: Platform K8s Manifest Conventions (`alkem-io/platform`)

### Decision
Follow the existing numbered-file convention with a dedicated `ecosystem-analytics/` directory. Use the sonarqube-style single-file IngressRoute pattern (multi-document YAML bundling IngressRoute + TLS + Middleware) rather than the libre-chat pattern (separate `traefik/` subdirectory).

### Rationale
- The repo uses `NN-<service>-<resource>.yml` naming with zero-padded numeric prefixes defining apply order
- The ordering convention is: Namespace → ConfigMap → Secret → Deployment → Service → IngressRoute
- Sonarqube bundles all Traefik resources in a single file (`11-sonarqube-ingressroute.yml`), which is more maintainable than libre-chat's 4-file `traefik/` subdirectory
- The libre-chat `traefik/` pattern is explicitly identified as tech debt (FR-013) and will be cleaned up in this feature
- File extension is `.yml` (not `.yaml`) throughout the repo
- Every manifest must be listed individually in the root `kustomization.yml`

### Alternatives Considered
- **Libre-chat pattern** (separate `traefik/` subdirectory with 4 files): Rejected because this is the tech debt pattern being cleaned up. Creates maintenance burden when TLS certs rotate.
- **Helm chart**: Rejected — the platform repo uses raw manifests with Kustomize, not Helm. Adding Helm would break consistency.

### Key Details

**Traefik namespace-scoping constraint**: Traefik CRDs resolve Middleware and TLSStore references namespace-locally. An IngressRoute in namespace `ecosystem-analytics` can only reference Middleware/TLSStore in the same namespace. Therefore, each namespace needs its own copies of:
- TLS certificate Secret (`alkemio-cert-secret`) — wildcard `*.alkem.io` cert
- TLSStore (`default`)
- TLSOption (`default`) — min TLS 1.2
- Middleware (`https-redirect`, `https-headers`)

**IngressRoute pattern** (from sonarqube):
```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: ecosystem-analytics
  namespace: ecosystem-analytics
spec:
  entryPoints: [web]
  routes:
    - match: Host(`ecosystem-analytics.alkem.io`)
      kind: Rule
      middlewares:
        - name: https-headers
      services:
        - name: ecosystem-analytics
          namespace: ecosystem-analytics
          port: 80
  tls:
    store:
      name: default
```

---

## R2: Terraform DNS Module (`alkem-io/infrastructure-provisioning`)

### Decision
Add an Azure DNS A record for `ecosystem-analytics.alkem.io` pointing to the production Scaleway cluster Traefik load balancer IP (`51.158.216.195`), following the existing A record pattern in `azure/dns/production/a-records.tf`.

### Rationale
- DNS is managed via Azure DNS (`azurerm` provider) despite clusters running on Scaleway/Hetzner
- All service subdomains (identity, libre-chat, sonarqube) use A records pointing to the Traefik LB IP
- TTL is consistently 300 seconds for A records
- The production DNS zone is `alkem.io` managed in `azure/dns/production/`
- State backend is Azure Blob Storage (`prodtfdnsstate`)

### Alternatives Considered
- **CNAME record**: Rejected — CNAME is used for external services (blog → Ghost, www → Netlify). Services on the cluster use A records to the LB IP.
- **Scaleway DNS**: Rejected — the existing infrastructure uses Azure DNS across all environments. Mixing providers adds complexity.

### Key Details

**Record format**:
```hcl
resource "azurerm_dns_a_record" "ecosystem-analytics" {
  name                = "ecosystem-analytics"
  zone_name           = azurerm_dns_zone.alkemio.name
  resource_group_name = azurerm_resource_group.dns-alkemio.name
  ttl                 = 300
  records             = ["51.158.216.195"]
}
```

**Cluster IPs by environment**:
| Environment | IP | Provider |
|---|---|---|
| Production (`alkem.io`) | `51.158.216.195` | Scaleway |
| Acceptance (`acc-alkem.io`) | `51.158.210.79` | Scaleway |
| Dev (`dev-alkem.io`) | `159.69.113.233` | Hetzner |

---

## R3: GitHub Actions CI/CD for Scaleway Container Registry

### Decision
Use a single GitHub Actions workflow with `docker/build-push-action@v6` for building, `docker/metadata-action@v5` for SHA tagging, `docker/login-action@v3` for Scaleway registry auth, and `azure/k8s-set-context@v4` + `kubectl set image` for deployment.

### Rationale
- Scaleway Container Registry uses standard Docker login (username `nologin`, password = Scaleway API Secret Key)
- No Scaleway-specific GitHub Actions exist; Docker's official actions are the recommended approach per Scaleway docs
- `docker/metadata-action` `type=sha` generates `sha-<7char>` tags automatically, matching FR-002
- `push: ${{ github.event_name != 'pull_request' }}` idiomatically handles build-only on PRs (FR-005)
- `azure/k8s-set-context` works with any Kubernetes cluster despite the "azure" prefix — it accepts raw kubeconfig
- BuildKit (via `setup-buildx-action`) optimizes multi-stage builds with layer caching

### Alternatives Considered
- **ArgoCD / FluxCD GitOps**: Rejected — adds infrastructure complexity for a single-service deployment. `kubectl set image` is simple, explicit, and matches the spec (clarification answer).
- **Scaleway CLI (`scw`) in pipeline**: Rejected — no advantage over Docker standard actions for registry push. Adds a vendor-specific dependency.
- **Separate workflow files for PR and main**: Rejected — a single workflow with conditional logic is simpler and avoids duplication.

### Key Details

**Required GitHub Secrets**:
| Secret | Value |
|---|---|
| `REGISTRY_LOGIN_SERVER` | Scaleway Container Registry URL (e.g. `rg.nl-ams.scw.cloud/alkemio`) |
| `REGISTRY_USERNAME` | Registry username (`nologin` for Scaleway) |
| `REGISTRY_PASSWORD` | Scaleway API secret key |
| `KUBECONFIG_SECRET_SCALEWAY_PROD` | Raw kubeconfig YAML for the production K8s cluster |

**Registry endpoint**: `rg.nl-ams.scw.cloud/alkemio/ecosystem-analytics`

**Workflow structure**:
- Single file: `.github/workflows/ci-cd.yml`
- Triggers: `push` to `main`, `pull_request` targeting `main`
- Jobs: `build` (always) → `deploy` (only on `main` push, needs `build`)
- Build job: checkout → setup-buildx → metadata → login (conditional) → build-push (conditional push)
- Deploy job: k8s-context → `kubectl set image` → `kubectl rollout status` (300s timeout)

**Build caching**: Registry-based cache using `cache-from: type=registry` from the `main` branch tag to speed up rebuilds.

---

## R4: Libre-Chat Tech Debt Cleanup

### Decision
Remove the `libre-chat/traefik/` subdirectory (4 files), move the IngressRoute definition inline as a single file within `libre-chat/` following the sonarqube pattern, and update `kustomization.yml` accordingly.

### Rationale
- The `libre-chat/traefik/` directory duplicates shared Traefik resources (TLS cert, TLSStore, TLSOption, 2 Middleware) that already exist at the root `traefik/` level — except namespaced to `librechat`
- The sonarqube service already demonstrates the correct pattern: a single multi-document YAML file bundling IngressRoute + TLS + Middleware
- Removing the separate directory reduces the number of files to maintain when TLS certificates rotate
- FR-013 explicitly requires this cleanup

### Files to Remove
- `libre-chat/traefik/01-traefik-cert.yml`
- `libre-chat/traefik/02-http-to-https-middleware.yml`
- `libre-chat/traefik/03-https-headers-middleware.yml`
- `libre-chat/traefik/04-libre-chat-ingress-route.yml`
- `libre-chat/traefik/` directory itself

### File to Create
- `libre-chat/06-libre-chat-ingressroute.yml` — single multi-document YAML containing IngressRoute + TLSStore + Secret + TLSOption + Middleware (same approach as `sonarqube/11-sonarqube-ingressroute.yml`)

---

## R5: Health Checks and Probes

### Decision
Use the existing `/api/health` endpoint for both liveness and readiness probes, with appropriate timing parameters for the Node.js application startup.

### Rationale
- The server already exposes `GET /api/health` returning `{ status: 'ok' }` (in `server/src/app.ts:25`)
- This endpoint is lightweight and does not require authentication
- SC-004 requires health checks to pass within 60 seconds of pod startup
- The existing Dockerfile exposes port 4000 and runs `node dist/index.js`

### Probe Configuration
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 4000
  initialDelaySeconds: 15
  periodSeconds: 30
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /api/health
    port: 4000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

---

## R6: Environment Variables for Production Deployment

### Decision
Split environment configuration between ConfigMap (non-sensitive) and Secret (sensitive), matching the existing `server/analytics.yml` substitution pattern.

### Rationale
- `server/analytics.yml` uses `${ENV_VAR}:default` syntax — the container reads environment variables at startup
- FR-012 requires ConfigMap for non-sensitive, Secret for sensitive values
- Constitution Principle I prohibits credentials in `.env` or config files; Kubernetes Secret meets this requirement
- The `ALKEMIO_KRATOS_PUBLIC_URL` is considered sensitive (internal service URL) and goes in Secret

### ConfigMap Values
| Variable | Value | Source |
|---|---|---|
| `NODE_ENV` | `production` | Fixed |
| `PORT` | `4000` | Fixed |
| `LOG_LEVEL` | `info` | Default |
| `LOG_JSON` | `true` | Production best practice |
| `CACHE_TTL_HOURS` | `24` | Default |
| `MAX_SPACES_PER_QUERY` | `10` | Default |
| `ALKEMIO_SERVER_URL` | `https://alkem.io` | Production URL |
| `ALKEMIO_GRAPHQL_ENDPOINT` | `https://alkem.io/api/private/non-interactive/graphql` | Production URL |

### Secret Values
| Variable | Source |
|---|---|
| `ALKEMIO_KRATOS_PUBLIC_URL` | Cluster-internal Kratos URL (set by platform operator) |
