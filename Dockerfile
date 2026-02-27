# Stage 1: Build frontend
FROM node:20-alpine AS build-frontend
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
COPY server/src/types/ ../server/src/types/
RUN pnpm run build

# Stage 2: Build server
FROM node:20-alpine AS build-server
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/ ./
RUN pnpm run build

# Stage 3: Production
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=build-server /app/server/package.json /app/server/pnpm-lock.yaml ./
COPY --from=build-server /app/server/dist ./dist
COPY server/analytics.yml ./
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

RUN pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
