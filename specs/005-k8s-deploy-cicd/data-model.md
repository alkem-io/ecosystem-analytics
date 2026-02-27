# Data Model: K8s Deployment with CI/CD Pipeline

**Feature**: 005-k8s-deploy-cicd | **Date**: 2026-02-26

This feature is infrastructure-focused. The "data model" describes Kubernetes resources and their relationships rather than application-level entities.

## Kubernetes Resources

### Namespace

| Field | Value |
|-------|-------|
| **Name** | `ecosystem-analytics` |
| **Purpose** | Isolate all ecosystem-analytics resources from other services |

### ConfigMap

| Field | Value |
|-------|-------|
| **Name** | `ecosystem-analytics-config` |
| **Namespace** | `ecosystem-analytics` |
| **Data keys** | `NODE_ENV`, `PORT`, `LOG_LEVEL`, `LOG_JSON`, `CACHE_TTL_HOURS`, `MAX_SPACES_PER_QUERY`, `ALKEMIO_SERVER_URL`, `ALKEMIO_GRAPHQL_ENDPOINT` |
| **Consumed by** | Deployment (envFrom) |

### Secret

| Field | Value |
|-------|-------|
| **Name** | `ecosystem-analytics-secrets` |
| **Namespace** | `ecosystem-analytics` |
| **Type** | `Opaque` |
| **Data keys** | `ALKEMIO_KRATOS_PUBLIC_URL` |
| **Consumed by** | Deployment (envFrom) |
| **Management** | Created manually by platform operator; values not in version control |

### Deployment

| Field | Value |
|-------|-------|
| **Name** | `ecosystem-analytics` |
| **Namespace** | `ecosystem-analytics` |
| **Replicas** | 1 |
| **Strategy** | RollingUpdate (maxSurge: 1, maxUnavailable: 0) |
| **Container image** | `rg.nl-ams.scw.cloud/alkemio/ecosystem-analytics:sha-<7char>` |
| **Container port** | 4000 |
| **Resources requests** | 512Mi memory, 500m CPU |
| **Resources limits** | 1Gi memory, 1000m CPU |
| **Liveness probe** | HTTP GET `/api/health` :4000, initialDelay 15s, period 30s, failure 3 |
| **Readiness probe** | HTTP GET `/api/health` :4000, initialDelay 10s, period 10s, failure 3 |
| **Environment** | ConfigMap (`ecosystem-analytics-config`) + Secret (`ecosystem-analytics-secrets`) via envFrom |

### Service

| Field | Value |
|-------|-------|
| **Name** | `ecosystem-analytics` |
| **Namespace** | `ecosystem-analytics` |
| **Type** | ClusterIP |
| **Port** | 80 → targetPort 4000 |
| **Selector** | `app: ecosystem-analytics` |

### IngressRoute (Traefik CRD)

| Field | Value |
|-------|-------|
| **Name** | `ecosystem-analytics` |
| **Namespace** | `ecosystem-analytics` |
| **Entry points** | `web` |
| **Match rule** | `` Host(`ecosystem-analytics.alkem.io`) `` |
| **Middleware** | `https-headers` (namespace-local) |
| **Service target** | `ecosystem-analytics:80` in `ecosystem-analytics` namespace |
| **TLS** | TLSStore `default` (namespace-local, wildcard `*.alkem.io` cert) |

### Supporting Traefik Resources (bundled in IngressRoute file)

| Resource | Name | Namespace | Purpose |
|----------|------|-----------|---------|
| Secret | `alkemio-cert-secret` | `ecosystem-analytics` | Wildcard TLS cert + key for `*.alkem.io` |
| TLSStore | `default` | `ecosystem-analytics` | References the cert secret |
| TLSOption | `default` | `ecosystem-analytics` | Enforces min TLS 1.2 |
| Middleware | `https-redirect` | `ecosystem-analytics` | Redirects HTTP → HTTPS |
| Middleware | `https-headers` | `ecosystem-analytics` | Adds `X-Forwarded-Proto: https` header |

## DNS Record

| Field | Value |
|-------|-------|
| **Provider** | Azure DNS (`azurerm`) |
| **Zone** | `alkem.io` |
| **Type** | A |
| **Name** | `ecosystem-analytics` |
| **TTL** | 300 |
| **Value** | `51.158.216.195` (Scaleway production Traefik LB) |

## CI/CD Pipeline

### GitHub Actions Workflow

| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-cd.yml` |
| **Triggers** | `push` to `main`, `pull_request` targeting `main` |
| **Jobs** | `build` → `deploy` (deploy only on `main` push) |

### Container Image

| Field | Value |
|-------|-------|
| **Registry** | Scaleway Container Registry (`rg.nl-ams.scw.cloud`) |
| **Tag format** | `sha-<7-char-git-sha>` (via `docker/metadata-action` `type=sha`) |
| **Build context** | Repository root (multi-stage Dockerfile) |
| **Push condition** | Only on `main` branch push (not on PRs) |

## Resource Relationships

```text
DNS A Record (ecosystem-analytics.alkem.io)
  → Traefik LoadBalancer Service (51.158.216.195)
    → IngressRoute (Host match)
      → Service (ecosystem-analytics:80)
        → Deployment (ecosystem-analytics)
          → Pod (container port 4000)
            ← ConfigMap (env vars)
            ← Secret (sensitive env vars)
            ← Container Image (from Scaleway Registry)
              ← GitHub Actions Pipeline (build + push)
```
