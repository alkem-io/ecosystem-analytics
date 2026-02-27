# Tasks: K8s Deployment with CI/CD Pipeline

**Input**: Design documents from `/specs/005-k8s-deploy-cicd/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story. Stories are ordered by implementation dependency (not raw priority) because US2 (P2) depends on US1, US3, and US4 being deployed first. See Dependencies section for details.

**Cross-repo note**: This feature spans 3 repositories. Each user story phase notes its target repository. Tasks for external repos (`alkem-io/platform`, `alkem-io/infrastructure-provisioning`) must be committed to those repos separately.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify prerequisites before creating infrastructure files

- [x] T001 Verify existing Dockerfile builds successfully from repository root (`docker build -t ecosystem-analytics .`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

No blocking prerequisites — each user story touches independent repositories and file sets. Proceed directly to user story phases.

**Checkpoint**: Proceed to user story implementation

---

## Phase 3: User Story 1 — Automated Build & Deploy on Merge (Priority: P1) MVP

**Goal**: When code is merged to `main`, a GitHub Actions pipeline automatically builds a container image tagged with the 7-char git SHA, pushes it to Scaleway Container Registry, and deploys to the K8s cluster via `kubectl set image` with zero-downtime rolling update.

**Independent Test**: Merge a trivial change to `main` — confirm the new image appears in the registry with the correct SHA tag and the running deployment is updated. Open a PR — confirm the image builds but is NOT pushed and NOT deployed.

**Target repository**: `alkem-io/ecosystem-analytics` (this repo)

### Implementation for User Story 1

- [x] T002 [US1] Create GitHub Actions CI/CD workflow with build job in `.github/workflows/ci-cd.yml` — triggers on push to `main` and pull_request targeting `main`; steps: checkout (`actions/checkout@v4`), setup-buildx (`docker/setup-buildx-action@v3`), metadata (`docker/metadata-action@v5` with `type=sha` tag), conditional registry login (`docker/login-action@v3` with Scaleway `rg.nl-ams.scw.cloud`, username `nologin`, password `SCW_SECRET_KEY`), build-push (`docker/build-push-action@v6` with conditional push, registry cache) per `contracts/ci-cd-workflow.yml`
- [x] T003 [US1] Add deploy job to CI/CD workflow in `.github/workflows/ci-cd.yml` — runs only on `main` push after build succeeds; steps: set K8s context (`azure/k8s-set-context@v4` with `KUBECONFIG` secret), `kubectl set image` targeting `deployment/ecosystem-analytics` in namespace `ecosystem-analytics` with `sha-<7char>` tag, `kubectl rollout status` with 300s timeout per `contracts/ci-cd-workflow.yml`

**Checkpoint**: CI/CD workflow file exists and is syntactically valid. Pipeline will execute once manifests (US3) and DNS (US4) are deployed.

---

## Phase 4: User Story 3 — K8s Manifests Follow Platform Conventions (Priority: P3)

**Goal**: Create Kubernetes manifests for ecosystem-analytics following the `alkem-io/platform` numbered-file convention (`NN-ecosystem-analytics-<resource>.yml`) in a dedicated namespace. Clean up libre-chat tech debt by replacing the `traefik/` subdirectory with a single consolidated IngressRoute file.

**Independent Test**: `kubectl apply -f ecosystem-analytics/` succeeds; all resources created in the `ecosystem-analytics` namespace; IngressRoute routes traffic to the service; libre-chat still works after `traefik/` cleanup.

**Target repository**: `alkem-io/platform`

### Implementation for User Story 3

- [x] T004 [P] [US3] Create namespace manifest in `ecosystem-analytics/01-ecosystem-analytics-namespace.yml` per `contracts/k8s-manifests.md` section 01
- [x] T005 [P] [US3] Create ConfigMap manifest with production env vars (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `LOG_JSON`, `CACHE_TTL_HOURS`, `MAX_SPACES_PER_QUERY`, `ALKEMIO_SERVER_URL`, `ALKEMIO_GRAPHQL_ENDPOINT`) in `ecosystem-analytics/02-ecosystem-analytics-configmap.yml` per `contracts/k8s-manifests.md` section 02
- [x] T006 [P] [US3] Create Secret template manifest with `ALKEMIO_KRATOS_PUBLIC_URL` placeholder in `ecosystem-analytics/03-ecosystem-analytics-secrets.yml` per `contracts/k8s-manifests.md` section 03
- [x] T007 [US3] Create Deployment manifest with 1 replica, RollingUpdate (maxSurge: 1, maxUnavailable: 0), resource requests (512Mi/500m) and limits (1Gi/1000m), liveness probe (GET `/api/health` :4000, initialDelay 15s, period 30s), readiness probe (GET `/api/health` :4000, initialDelay 10s, period 10s), envFrom ConfigMap + Secret in `ecosystem-analytics/04-ecosystem-analytics-deployment.yml` per `contracts/k8s-manifests.md` section 04
- [x] T008 [P] [US3] Create Service manifest (ClusterIP, port 80 → targetPort 4000) in `ecosystem-analytics/05-ecosystem-analytics-service.yml` per `contracts/k8s-manifests.md` section 05
- [x] T009 [US3] Create IngressRoute multi-document manifest bundling TLS cert Secret (`alkemio-cert-secret`), TLSStore (`default`), TLSOption (`default`, min TLS 1.2), Middleware (`https-redirect`, `https-headers`), and IngressRoute (Host match `ecosystem-analytics.alkem.io`, entryPoint `web`, service port 80) in `ecosystem-analytics/06-ecosystem-analytics-ingressroute.yml` per `contracts/k8s-manifests.md` section 06
- [x] T010 [US3] Remove `libre-chat/traefik/` directory and all 4 files (`01-traefik-cert.yml`, `02-http-to-https-middleware.yml`, `03-https-headers-middleware.yml`, `04-libre-chat-ingress-route.yml`) per FR-013 tech debt cleanup (research.md R4)
- [x] T011 [US3] Create consolidated `libre-chat/06-libre-chat-ingressroute.yml` as single multi-document YAML with IngressRoute + TLS + Middleware for `libre-chat.alkem.io` in `librechat` namespace, following the sonarqube pattern per research.md R4 and `contracts/k8s-manifests.md` Libre-Chat section
- [x] T012 [US3] Update root `kustomization.yml` — add all 6 `ecosystem-analytics/*.yml` paths, remove `libre-chat/traefik/*.yml` paths, add `libre-chat/06-libre-chat-ingressroute.yml`

**Checkpoint**: All manifests are valid YAML, follow platform conventions, and can be applied to the cluster. Libre-chat traefik/ directory is removed and replaced with consolidated IngressRoute file.

---

## Phase 5: User Story 4 — DNS Managed via Infrastructure-as-Code (Priority: P4)

**Goal**: Add a Terraform-managed DNS A record for `ecosystem-analytics.alkem.io` pointing to the production Scaleway cluster Traefik load balancer IP (`51.158.216.195`).

**Independent Test**: `terraform plan` shows the new A record; after `terraform apply`, `dig ecosystem-analytics.alkem.io` resolves to `51.158.216.195`.

**Target repository**: `alkem-io/infrastructure-provisioning`

### Implementation for User Story 4

- [x] T013 [US4] Add Azure DNS A record resource `ecosystem-analytics` with TTL 300 pointing to `51.158.216.195` in `azure/dns/production/a-records.tf` per `contracts/dns-record.tf`

**Checkpoint**: `terraform plan` confirms the new record with no unexpected changes.

---

## Phase 6: User Story 2 — Production Application Accessible via Domain (Priority: P2)

**Goal**: The application is accessible at `https://ecosystem-analytics.alkem.io` with HTTPS, working authentication, and functional graph visualization.

**Independent Test**: Navigate to `https://ecosystem-analytics.alkem.io` — frontend loads, login succeeds, graph renders.

**Dependencies**: Requires US1 (pipeline deployed), US3 (manifests applied to cluster), and US4 (DNS propagated). This story has no unique implementation files — it validates that the infrastructure from US1 + US3 + US4 delivers end-to-end accessibility.

### Implementation for User Story 2

- [ ] T014 [US2] **MANUAL** Run end-to-end validation per `specs/005-k8s-deploy-cicd/quickstart.md` — verify DNS resolution (`dig ecosystem-analytics.alkem.io` → `51.158.216.195`), HTTPS access (`curl -I https://ecosystem-analytics.alkem.io` → 200), HTTP redirect (`curl -I http://ecosystem-analytics.alkem.io` → 301), health endpoint (`/api/health` → `{"status":"ok"}`), frontend SPA loads, authentication works, graph renders
- [ ] T015 [US2] **MANUAL** Verify pipeline end-to-end: open a PR targeting `main` (build runs, no push, no deploy), merge to `main` (build + push + deploy completes), confirm running pod uses `sha-<commit-sha>` image tag, confirm zero-downtime during rollout

**Checkpoint**: All acceptance scenarios from spec.md US2 are satisfied. Application is production-ready.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and documentation

- [x] T016 [P] Document required GitHub Actions secrets (`SCW_SECRET_KEY`, `KUBECONFIG`) setup instructions in repository wiki or PR description
- [ ] T017 **MANUAL** Run full quickstart.md validation checklist (`specs/005-k8s-deploy-cicd/quickstart.md`) and confirm all items pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verify Dockerfile builds
- **Foundational (Phase 2)**: Skipped — no blocking prerequisites
- **US1 (Phase 3)**: Depends on Setup — creates CI/CD workflow in this repo
- **US3 (Phase 4)**: Depends on Setup — creates K8s manifests in `alkem-io/platform`
- **US4 (Phase 5)**: Depends on Setup — creates DNS record in `alkem-io/infrastructure-provisioning`
- **US2 (Phase 6)**: Depends on US1 + US3 + US4 all deployed — integration validation
- **Polish (Phase 7)**: Depends on US2 validation passing

### User Story Dependencies

- **US1 (P1)**: Can start after Setup — no dependencies on other stories. Creates `.github/workflows/ci-cd.yml` in this repo.
- **US3 (P3)**: Can start after Setup — no dependencies on other stories. Creates manifests in `alkem-io/platform`. **US1, US3, US4 can proceed in parallel.**
- **US4 (P4)**: Can start after Setup — no dependencies on other stories. Creates DNS record in `alkem-io/infrastructure-provisioning`. **US1, US3, US4 can proceed in parallel.**
- **US2 (P2)**: Cannot start until US1, US3, and US4 are deployed. Highest business priority (P2) but last in execution order due to dependencies. Pure integration validation.

### Priority vs. Implementation Order

| Story | Business Priority | Implementation Phase | Reason |
|-------|------------------|---------------------|--------|
| US1 | P1 | Phase 3 | Core pipeline — can start immediately |
| US2 | P2 | Phase 6 | Integration validation — depends on US1+US3+US4 |
| US3 | P3 | Phase 4 | K8s manifests — can start immediately, parallel with US1 |
| US4 | P4 | Phase 5 | DNS record — can start immediately, parallel with US1+US3 |

### Within Each User Story

- US1: Build job before deploy job (T002 → T003)
- US3: Namespace/ConfigMap/Secret/Service can be parallel (T004-T006, T008). Deployment after ConfigMap+Secret (T007 after T005, T006). IngressRoute after Service (T009 after T008). Libre-chat cleanup (T010 → T011) independent of ecosystem-analytics manifests. Kustomization.yml last (T012 after all manifests).
- US4: Single task (T013)
- US2: Validation only — all tasks after US1+US3+US4 deployed

### Parallel Opportunities

**Cross-story parallelism** (after Setup):
- US1 (this repo), US3 (`alkem-io/platform`), US4 (`alkem-io/infrastructure-provisioning`) can all proceed in parallel — they touch different repositories

**Within US3**:
- T004, T005, T006, T008 can run in parallel (different manifest files)
- T010, T011 (libre-chat cleanup) can run in parallel with T004-T009 (ecosystem-analytics manifests)

---

## Parallel Example: User Story 3

```bash
# Launch all independent manifest tasks together:
Task: "Create namespace manifest in ecosystem-analytics/01-ecosystem-analytics-namespace.yml"
Task: "Create ConfigMap manifest in ecosystem-analytics/02-ecosystem-analytics-configmap.yml"
Task: "Create Secrets template in ecosystem-analytics/03-ecosystem-analytics-secrets.yml"
Task: "Create Service manifest in ecosystem-analytics/05-ecosystem-analytics-service.yml"

# After ConfigMap + Secret are done:
Task: "Create Deployment manifest in ecosystem-analytics/04-ecosystem-analytics-deployment.yml"

# After Service is done:
Task: "Create IngressRoute manifest in ecosystem-analytics/06-ecosystem-analytics-ingressroute.yml"

# Libre-chat cleanup (parallel with above):
Task: "Remove libre-chat/traefik/ directory"
Task: "Create libre-chat/06-libre-chat-ingressroute.yml"

# After all manifests:
Task: "Update root kustomization.yml"
```

## Parallel Example: Cross-Story

```bash
# All three stories can start in parallel after Setup:
Developer A (this repo):     US1 — CI/CD workflow (.github/workflows/ci-cd.yml)
Developer B (platform repo): US3 — K8s manifests (ecosystem-analytics/*.yml + libre-chat cleanup)
Developer C (infra repo):    US4 — DNS record (azure/dns/production/a-records.tf)

# After all three are deployed:
Any developer: US2 — End-to-end validation
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify Dockerfile)
2. Complete Phase 3: US1 (CI/CD workflow)
3. **STOP and VALIDATE**: Workflow file is syntactically valid, triggers on correct events
4. Pipeline will fully work once US3 manifests are applied to the cluster

### Incremental Delivery

1. Complete Setup → Dockerfile builds
2. US1 (CI/CD) + US3 (manifests) + US4 (DNS) in parallel → Three PRs to three repos
3. Apply manifests to cluster (US3) → Deploy DNS (US4) → Trigger first pipeline run (US1)
4. US2 validation → Confirm end-to-end accessibility
5. Polish → Documentation and final checklist

### Parallel Team Strategy

With multiple developers:

1. After Setup, all three stories start in parallel:
   - Developer A: US1 — CI/CD workflow (this repo)
   - Developer B: US3 — K8s manifests (`alkem-io/platform`)
   - Developer C: US4 — DNS record (`alkem-io/infrastructure-provisioning`)
2. Once all three are merged and deployed, any developer runs US2 validation
3. Final polish and documentation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature spans 3 repos — commit tasks to the correct repository
- US2 is P2 business priority but Phase 6 execution order (depends on US1+US3+US4)
- Secrets (registry credentials, kubeconfig) and TLS cert data are populated by the platform operator — NOT committed to version control
- Registry namespace resolved: `rg.nl-ams.scw.cloud/alkemio` (confirmed from production cluster)
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
