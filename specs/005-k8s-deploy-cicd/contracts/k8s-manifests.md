# Contract: Kubernetes Manifests (`alkem-io/platform`)

## Directory Layout

```text
alkem-io/platform/
└── ecosystem-analytics/
    ├── 01-ecosystem-analytics-namespace.yml
    ├── 02-ecosystem-analytics-configmap.yml
    ├── 03-ecosystem-analytics-secrets.yml
    ├── 04-ecosystem-analytics-deployment.yml
    ├── 05-ecosystem-analytics-service.yml
    └── 06-ecosystem-analytics-ingressroute.yml
```

## 01 — Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ecosystem-analytics
```

## 02 — ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ecosystem-analytics-config
  namespace: ecosystem-analytics
data:
  NODE_ENV: "production"
  PORT: "4000"
  LOG_LEVEL: "info"
  LOG_JSON: "true"
  CACHE_TTL_HOURS: "24"
  MAX_SPACES_PER_QUERY: "10"
  ALKEMIO_SERVER_URL: "https://alkem.io"
  ALKEMIO_GRAPHQL_ENDPOINT: "https://alkem.io/api/private/non-interactive/graphql"
```

## 03 — Secret (template — values populated by operator)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ecosystem-analytics-secrets
  namespace: ecosystem-analytics
type: Opaque
stringData:
  ALKEMIO_KRATOS_PUBLIC_URL: "<SET_BY_OPERATOR>"
```

## 04 — Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ecosystem-analytics
  namespace: ecosystem-analytics
  labels:
    app: ecosystem-analytics
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ecosystem-analytics
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: ecosystem-analytics
    spec:
      containers:
        - name: ecosystem-analytics
          image: rg.fr-par.scw.cloud/<NAMESPACE>/ecosystem-analytics:sha-0000000
          ports:
            - containerPort: 4000
          envFrom:
            - configMapRef:
                name: ecosystem-analytics-config
            - secretRef:
                name: ecosystem-analytics-secrets
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
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

## 05 — Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ecosystem-analytics
  namespace: ecosystem-analytics
spec:
  selector:
    app: ecosystem-analytics
  ports:
    - port: 80
      targetPort: 4000
      protocol: TCP
```

## 06 — IngressRoute (multi-document YAML)

Single file containing IngressRoute + TLSStore + TLS Secret + TLSOption + Middleware resources, all namespaced to `ecosystem-analytics`. Follows the `sonarqube/11-sonarqube-ingressroute.yml` pattern.

```yaml
# TLS certificate secret (wildcard *.alkem.io — copied from shared config)
apiVersion: v1
kind: Secret
metadata:
  name: alkemio-cert-secret
  namespace: ecosystem-analytics
type: kubernetes.io/tls
data:
  tls.crt: <BASE64_CERT>
  tls.key: <BASE64_KEY>
---
# TLS store
apiVersion: traefik.containo.us/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: ecosystem-analytics
spec:
  defaultCertificate:
    secretName: alkemio-cert-secret
---
# TLS option (min TLS 1.2)
apiVersion: traefik.containo.us/v1alpha1
kind: TLSOption
metadata:
  name: default
  namespace: ecosystem-analytics
spec:
  minVersion: VersionTLS12
---
# HTTP to HTTPS redirect middleware
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: https-redirect
  namespace: ecosystem-analytics
spec:
  redirectScheme:
    scheme: https
    permanent: true
---
# HTTPS headers middleware
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: https-headers
  namespace: ecosystem-analytics
spec:
  headers:
    customRequestHeaders:
      X-Forwarded-Proto: "https"
---
# Ingress route
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: ecosystem-analytics
  namespace: ecosystem-analytics
spec:
  entryPoints:
    - web
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

## Libre-Chat Tech Debt Cleanup

### Files to Remove
- `libre-chat/traefik/01-traefik-cert.yml`
- `libre-chat/traefik/02-http-to-https-middleware.yml`
- `libre-chat/traefik/03-https-headers-middleware.yml`
- `libre-chat/traefik/04-libre-chat-ingress-route.yml`
- `libre-chat/traefik/` (empty directory)

### File to Create
- `libre-chat/06-libre-chat-ingressroute.yml` — single multi-document YAML with same pattern as above, namespaced to `librechat`, matching Host `` `libre-chat.alkem.io` ``

### kustomization.yml Updates
- Remove paths referencing `libre-chat/traefik/*.yml`
- Add `libre-chat/06-libre-chat-ingressroute.yml`
- Add all `ecosystem-analytics/*.yml` paths
