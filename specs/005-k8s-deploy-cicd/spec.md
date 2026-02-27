# Feature Specification: K8s Deployment with CI/CD Pipeline

**Feature Branch**: `005-k8s-deploy-cicd`
**Created**: 2026-02-26
**Status**: Draft
**Input**: [GitHub Issue #13](https://github.com/alkem-io/ecosystem-analytics/issues/13) — Deploy ecosystem-analytics to Platform K8s cluster with CI/CD pipeline

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Build & Deploy on Merge (Priority: P1)

As a developer, when I merge code to `main`, the application is automatically built, packaged, and deployed to the production Kubernetes cluster without any manual intervention, so that releases are fast, consistent, and traceable.

**Why this priority**: This is the core value proposition — without automated deployment, all other infrastructure work (manifests, DNS, secrets) has no delivery mechanism. Every subsequent story depends on a working CI/CD pipeline.

**Independent Test**: Can be validated by merging a trivial change to `main` and confirming the new container image appears in the registry with the correct SHA tag, and the running deployment is updated.

**Acceptance Scenarios**:

1. **Given** a pull request is merged to `main`, **When** GitHub Actions triggers, **Then** a container image is built using the existing multi-stage Dockerfile and pushed to the Scaleway Container Registry tagged with the 7-character git SHA of the merge commit
2. **Given** a new container image is successfully pushed, **When** the deployment step runs, **Then** the Kubernetes deployment is updated to the new image tag with zero-downtime rolling update
3. **Given** a build fails (compilation error, test failure), **When** the pipeline reaches the build step, **Then** no image is pushed and no deployment occurs, and the failure is visible in GitHub Actions
4. **Given** a PR is opened (not merged), **When** the build workflow runs, **Then** the image is built for validation but NOT pushed to the registry and NOT deployed

---

### User Story 2 - Production Application Accessible via Domain (Priority: P2)

As an end user, I can access ecosystem-analytics at `ecosystem-analytics.alkem.io` over HTTPS, where the application loads correctly, authentication works, and graph visualization renders, so that the tool is available for production use.

**Why this priority**: The application must be reachable by users at a stable, secure URL. This story validates the full stack: DNS, ingress, TLS, service routing, and application health.

**Independent Test**: Can be validated by navigating to `https://ecosystem-analytics.alkem.io`, confirming the frontend loads, logging in with Alkemio credentials, selecting a Space, and rendering a graph.

**Acceptance Scenarios**:

1. **Given** the deployment is running on the Platform K8s cluster, **When** a user navigates to `https://ecosystem-analytics.alkem.io`, **Then** the frontend SPA loads successfully with all assets
2. **Given** HTTP access to `ecosystem-analytics.alkem.io`, **When** a user visits via HTTP, **Then** they are automatically redirected to HTTPS
3. **Given** the application is running, **When** a user authenticates with valid Alkemio credentials, **Then** authentication succeeds and spaces are listed
4. **Given** a valid session, **When** a user selects a Space and generates a graph, **Then** the force-directed graph renders correctly with nodes and edges

---

### User Story 3 - Kubernetes Manifests Follow Platform Conventions (Priority: P3)

As a platform operator, the ecosystem-analytics Kubernetes manifests follow the same conventions as other services in the `alkem-io/platform` repo (numbered files, shared Traefik config, dedicated namespace), so that the cluster remains consistent and maintainable.

**Why this priority**: Consistency across services reduces operational burden and onboarding time. This also includes cleaning up the existing libre-chat tech debt (duplicated Traefik config) to establish the correct pattern going forward.

**Independent Test**: Can be validated by reviewing the manifest files in the `alkem-io/platform` repo, applying them to the cluster, and confirming the service is accessible through the shared ingress.

**Acceptance Scenarios**:

1. **Given** the `alkem-io/platform` repo, **When** manifests are added under `ecosystem-analytics/`, **Then** they follow the `NN-ecosystem-analytics-<resource>.yml` naming convention with ConfigMap, Secret, Deployment, Service, and IngressRoute
2. **Given** the existing `libre-chat/traefik/` directory with duplicated TLS/middleware configs, **When** the tech debt cleanup is complete, **Then** the duplicate files are removed, the libre-chat IngressRoute is moved inline, and the empty `traefik/` subfolder is deleted
3. **Given** the ecosystem-analytics IngressRoute, **When** it is applied, **Then** it bundles namespace-local copies of the shared Traefik TLS and middleware resources (required by Traefik's namespace-scoping constraint) following the sonarqube single-file pattern

---

### User Story 4 - DNS Managed via Infrastructure-as-Code (Priority: P4)

As a platform operator, the DNS record for `ecosystem-analytics.alkem.io` is managed through Terraform in the `alkem-io/infrastructure-provisioning` repo alongside other Alkemio subdomains, so that DNS configuration is versioned, reviewable, and consistent.

**Why this priority**: DNS is a one-time setup but must be managed as code for auditability and disaster recovery. Manual DNS changes create drift and operational risk.

**Independent Test**: Can be validated by running `terraform plan` and confirming the DNS record is present, then verifying the domain resolves to the cluster ingress IP.

**Acceptance Scenarios**:

1. **Given** the `alkem-io/infrastructure-provisioning` repo, **When** the Terraform DNS module is updated, **Then** a DNS record for `ecosystem-analytics.alkem.io` points to the Platform K8s cluster ingress controller
2. **Given** the DNS record is applied, **When** a DNS lookup is performed for `ecosystem-analytics.alkem.io`, **Then** it resolves to the correct IP address of the ingress controller

---

### Edge Cases

- What happens when the Scaleway Container Registry is temporarily unavailable during a push? The pipeline should fail gracefully and report the error; no deployment occurs.
- What happens when the Kubernetes cluster is unreachable during the deploy step? The pipeline should fail with a clear error; the previously running version remains active.
- What happens when a deployment rolls out a broken image (app crashes on startup)? The rolling update strategy should detect failed readiness probes and halt the rollout, keeping the previous healthy pods running. Recovery is manual via `kubectl rollout undo`; no automatic rollback is configured.
- What happens when the DNS record is not yet propagated but the ingress is configured? Users see a DNS resolution error; the application is still accessible via direct cluster IP or port-forward for debugging.
- What happens when secrets (registry credentials, kubeconfig) expire or are rotated? The pipeline fails on the next run; re-populating the GitHub Actions secrets restores functionality.

## Clarifications

### Session 2026-02-26

- Q: How should the CI/CD pipeline deploy updates to the Kubernetes cluster? → A: `kubectl set image` — pipeline authenticates with kubeconfig and updates the deployment image tag directly
- Q: How many pod replicas should the production deployment run? → A: 1 replica — minimal footprint for low-traffic internal tool
- Q: What CPU and memory resource limits for the application pod? → A: Standard — requests 512Mi/500m, limits 1Gi/1000m
- Q: What Kubernetes namespace should ecosystem-analytics be deployed to? → A: Dedicated `ecosystem-analytics` namespace
- Q: What level of observability should be configured for the deployed application? → A: Stdout/stderr only — rely on `kubectl logs`, no additional monitoring infrastructure
- Q: Which branch should trigger the production build-and-deploy pipeline? → A: `main` — a separate production branch; merges from `develop` to `main` trigger deploys (gitflow model)
- Q: Should the CI/CD pipeline include container image vulnerability scanning? → A: No — skip for initial deployment; can be added later without architectural changes
- Q: Should failed deployments trigger automatic rollback or rely on manual intervention? → A: Manual only — K8s halts the rollout natively; operator runs `kubectl rollout undo` when needed
- Q: What is explicitly out of scope for this feature? → A: Staging environment, horizontal pod autoscaling, Prometheus/alerting, and automated rollback

## Out of Scope

- **Staging environment** — no pre-production environment or multi-environment pipeline; single production deployment only
- **Horizontal pod autoscaling** — fixed 1-replica deployment; no HPA configuration
- **Prometheus / alerting** — no metrics collection, dashboards, or alert rules; observability is stdout/stderr only
- **Automated rollback** — no pipeline-driven rollback; recovery is manual via `kubectl rollout undo`

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST automatically build a container image from the existing multi-stage Dockerfile when code is merged to `main`
- **FR-002**: The system MUST tag container images with the 7-character git SHA of the merge commit (no `latest` tag used in deployments)
- **FR-003**: The system MUST push built images to the Scaleway Container Registry at the organization's designated path
- **FR-004**: The system MUST automatically deploy the newly built image to the Platform K8s cluster after a successful push on `main` merges, using `kubectl set image` to update the deployment's image tag
- **FR-005**: The system MUST validate builds on pull requests without pushing images or triggering deployments
- **FR-006**: The Kubernetes deployment MUST run 1 replica and use a rolling update strategy (maxSurge: 1, maxUnavailable: 0) to ensure zero-downtime releases
- **FR-007**: The deployment MUST include health checks (liveness and readiness probes) to detect and prevent serving unhealthy instances
- **FR-015**: The deployment MUST set resource requests (512Mi memory, 500m CPU) and limits (1Gi memory, 1000m CPU) for the application container
- **FR-008**: The application MUST be accessible at `ecosystem-analytics.alkem.io` over HTTPS using the shared platform Traefik ingress configuration
- **FR-009**: HTTP requests to the domain MUST be redirected to HTTPS (handled by shared Traefik middleware)
- **FR-010**: The DNS record for `ecosystem-analytics.alkem.io` MUST be managed via Terraform in the infrastructure-provisioning repo
- **FR-011**: Kubernetes manifests MUST reside in the `alkem-io/platform` repo under an `ecosystem-analytics/` directory following the established numbered naming convention, deployed to a dedicated `ecosystem-analytics` namespace
- **FR-012**: Configuration (non-sensitive environment variables) MUST be stored in a ConfigMap; sensitive credentials MUST be stored in a Kubernetes Secret
- **FR-013**: The existing `libre-chat/traefik/` duplicate Traefik configs MUST be removed as part of tech debt cleanup, with the IngressRoute moved alongside the other libre-chat manifests
- **FR-014**: The CI/CD pipeline MUST provide clear failure reporting when builds, pushes, or deployments fail

### Key Entities

- **Container Image**: A built, tagged artifact stored in the container registry, identified by the git SHA of the source commit
- **Deployment**: The Kubernetes resource managing the running application pods, including replica count, update strategy, and health probes
- **ConfigMap**: Non-sensitive configuration values (server URLs, port, log level, cache TTL) consumed by the deployment as environment variables
- **Secret**: Sensitive credentials (Kratos auth, platform tokens) consumed by the deployment, managed outside version control
- **IngressRoute**: The Traefik routing rule that maps the public domain to the internal Kubernetes service
- **DNS Record**: The infrastructure-as-code managed DNS entry pointing the public domain to the cluster ingress

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merge to `main` results in a deployed new version accessible at `ecosystem-analytics.alkem.io` within 10 minutes end-to-end (build + push + deploy + rollout)
- **SC-002**: Zero-downtime during deployments — existing users experience no service interruption when a new version rolls out
- **SC-003**: 100% of production container images are traceable to their source commit via the SHA tag (no untagged or `latest` images in use)
- **SC-004**: Application health checks pass within 60 seconds of pod startup (frontend loads, API responds, authentication flow works)
- **SC-005**: Failed builds or deployments are surfaced within 2 minutes via GitHub Actions status (no silent failures)
- **SC-006**: All infrastructure configuration (DNS, manifests, pipeline) is version-controlled and reviewable via pull requests across the three repos

### Non-Functional Requirements

- **NFR-001**: Observability relies on stdout/stderr logging (`kubectl logs`); no additional monitoring infrastructure (Prometheus, alerting) is required for initial deployment
- **NFR-002**: Container image vulnerability scanning is not required for initial deployment; the pipeline does not include scan-and-gate or scan-and-warn steps

### Assumptions

- The project uses a gitflow branching model: `develop` is the integration branch, `main` is the production release branch; CI/CD production deployments are triggered only by merges to `main`
- The existing multi-stage Dockerfile produces a working production image without modification
- The Platform K8s cluster has Traefik already configured as the ingress controller with shared TLS termination and middleware
- The Scaleway Container Registry is accessible from GitHub Actions and the K8s cluster
- GitHub Actions has (or will be given) the necessary credentials for registry push and cluster deployment (kubeconfig for `kubectl set image`)
- The `alkem-io/platform` repo accepts the same manifest conventions as the existing `libre-chat/` service
- The `alkem-io/infrastructure-provisioning` repo has an existing Terraform DNS module where the new record can be added
