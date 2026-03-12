# Implementation Plan: K8s Deployment with CI/CD Pipeline

**Branch**: `005-k8s-deploy-cicd` | **Date**: 2026-02-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-k8s-deploy-cicd/spec.md`

## Summary

Deploy ecosystem-analytics to the Alkemio Platform Kubernetes cluster with a GitHub Actions CI/CD pipeline. The pipeline builds a container image from the existing multi-stage Dockerfile, pushes to Scaleway Container Registry tagged with the 7-char git SHA, and deploys via `kubectl set image` with zero-downtime rolling updates. Infrastructure spans three repos: this repo (CI/CD workflow), `alkem-io/platform` (K8s manifests + Traefik ingress), and `alkem-io/infrastructure-provisioning` (Terraform DNS). Includes tech debt cleanup of duplicated Traefik configs in the libre-chat service.

## Technical Context

**Language/Version**: YAML (GitHub Actions, Kubernetes manifests), HCL (Terraform), existing TypeScript/Node 20 app unchanged
**Primary Dependencies**: GitHub Actions (`docker/build-push-action@v6`, `docker/metadata-action@v5`, `docker/login-action@v3`, `azure/k8s-set-context@v4`), Traefik CRDs (`traefik.containo.us/v1alpha1`), Azure DNS (`azurerm` Terraform provider)
**Storage**: N/A (no storage changes; existing SQLite cache runs inside container)
**Testing**: Manual validation — merge to `main` triggers pipeline, verify deployment at `ecosystem-analytics.alkem.io`; `terraform plan` for DNS
**Target Platform**: Scaleway Kubernetes (Kapsule) production cluster, Scaleway Container Registry
**Project Type**: Infrastructure/DevOps — CI/CD pipeline + Kubernetes manifests + DNS record
**Performance Goals**: End-to-end deploy within 10 minutes (SC-001), health check passes within 60s of pod startup (SC-004)
**Constraints**: 1 replica, 512Mi/500m requests, 1Gi/1000m limits, stdout/stderr logging only
**Scale/Scope**: Single production environment, single service, 3 repos touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Kratos API Flow Auth | PASS | No auth changes. ConfigMap provides `ALKEMIO_SERVER_URL`, `ALKEMIO_GRAPHQL_ENDPOINT`; Kratos URL provided via Secret or ConfigMap. No credentials in env/config files — only server deployment parameters per constitution. |
| II. Typed GraphQL Contract | PASS | No GraphQL changes. Codegen SDK unchanged. |
| III. BFF Boundary | PASS | Deployment preserves existing architecture — frontend served by BFF in production mode, all Alkemio traffic stays server-side. |
| IV. Data Sensitivity | PASS | Sensitive values (Kratos URL if internal) go in K8s Secret. No tokens logged. SQLite cache runs inside container with same per-user per-Space scoping. |
| V. Graceful Degradation | PASS | No application behavior changes. Health check endpoint `/api/health` already exists. |
| VI. Design Fidelity | PASS | No UI changes. |

**Gate result: ALL PASS** — no violations, proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/005-k8s-deploy-cicd/
├── plan.md              # This file
├── research.md          # Phase 0: platform conventions, CI/CD patterns, DNS module
├── data-model.md        # Phase 1: Kubernetes resource model
├── quickstart.md        # Phase 1: deployment validation guide
├── contracts/           # Phase 1: manifest and workflow contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (this repository)

```text
.github/workflows/
└── ci-cd.yml            # GitHub Actions workflow (build, push, deploy)
```

### External Repositories

```text
alkem-io/platform/
├── ecosystem-analytics/
│   ├── 01-ecosystem-analytics-namespace.yml
│   ├── 02-ecosystem-analytics-configmap.yml
│   ├── 03-ecosystem-analytics-secrets.yml
│   ├── 04-ecosystem-analytics-deployment.yml
│   ├── 05-ecosystem-analytics-service.yml
│   └── 06-ecosystem-analytics-ingressroute.yml   # IngressRoute + TLS + Middleware (sonarqube pattern)
├── libre-chat/
│   └── traefik/          # REMOVED (tech debt cleanup — FR-013)
└── kustomization.yml     # Updated with new resource paths

alkem-io/infrastructure-provisioning/
└── azure/dns/production/
    └── a-records.tf      # New A record for ecosystem-analytics.alkem.io → 51.158.216.195
```

**Structure Decision**: This is a pure infrastructure feature. No application source code changes. The CI/CD workflow lives in this repo under `.github/workflows/`. Kubernetes manifests and DNS records live in their respective external repos per established Alkemio conventions.

## Complexity Tracking

> No violations — table not applicable.
