# =====================================================================
# Ecosystem Analytics — multi-frontend workspace image
#
# Layout (post 016-vng-frontend pnpm-workspace conversion):
#   server/                        standalone install (NOT a workspace member)
#   frontend/shared/               @ea/shared workspace lib
#   frontend/ecosystem-analytics/  the Explorer SPA (was top-level frontend/)
#   frontend/vng/                  the VNG Kenniscentrum Innovatie SPA
#
# The Express BFF serves the Explorer's static build from `../frontend/dist`
# (see server/src/app.ts ~line 67 → resolves to /app/frontend/dist at runtime).
# The VNG build is copied to a sibling location (/app/frontend-vng/dist) so it
# can be served separately.
#
# DEPLOYMENT NOTE: per spec 016-vng-frontend (FR-002/FR-003) the two frontends
# are served as sibling subdomains under one parent domain (e.g. app.<domain>
# and vng.<domain>) sharing a single `ea_session` cookie scoped to the parent
# domain. This image bundles both static builds + the BFF; the ingress that maps
# each subdomain to its static bundle (and routes /api on both to this BFF) is
# OUT OF SCOPE here and lives in the k8s/Traefik manifests. Configure the shared
# session via SESSION_COOKIE_DOMAIN / SESSION_ALLOWED_ORIGINS (see server/.env.default).
# =====================================================================

# ---------------------------------------------------------------------
# Stage 1: Build both frontends from the pnpm workspace
# ---------------------------------------------------------------------
FROM node:22-alpine AS build-frontend
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

# Workspace manifests first (better layer caching for the install step).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY frontend/shared/package.json frontend/shared/package.json
COPY frontend/ecosystem-analytics/package.json frontend/ecosystem-analytics/package.json
COPY frontend/vng/package.json frontend/vng/package.json
RUN pnpm install --frozen-lockfile

# Frontend sources + the server types they import via the `@server/types` alias
# (frontend vite.config.ts resolves ../../server/src/types at build time).
COPY frontend/ ./frontend/
COPY server/src/types/ ./server/src/types/

# Build the Explorer and the VNG app (each emits dist/ next to its package.json).
RUN pnpm -C frontend/ecosystem-analytics run build \
  && pnpm -C frontend/vng run build

# ---------------------------------------------------------------------
# Stage 2: Build the standalone server
# ---------------------------------------------------------------------
FROM node:22-alpine AS build-server
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/ ./
RUN pnpm run build

# ---------------------------------------------------------------------
# Stage 3: Production runtime
# ---------------------------------------------------------------------
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

# Server runtime: package manifests, compiled output (dist/ already includes the
# committed data snapshot copied by `server build`), and analytics.yml config.
COPY --from=build-server /app/server/package.json /app/server/pnpm-lock.yaml /app/server/pnpm-workspace.yaml ./
COPY --from=build-server /app/server/dist ./dist
COPY server/analytics.yml ./

# Explorer static build → the path the BFF serves (/app/frontend/dist).
COPY --from=build-frontend /app/frontend/ecosystem-analytics/dist ./frontend/dist
# VNG static build → sibling location for separate (subdomain) serving.
COPY --from=build-frontend /app/frontend/vng/dist ./frontend-vng/dist

RUN pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
# Explorer + /api on 4000; the VNG SPA + the same /api on 4001 (vngPort = port+1).
# A single container backs both subdomains (e.g. analytics.* and vih-analytics.*),
# sharing the `ea_session` cookie. Override VNG_FRONTEND_PORT to change the second port.
ENV ECOSYSTEM_ANALYTICS_BACKEND_PORT=4000
EXPOSE 4000 4001

CMD ["node", "dist/index.js"]
