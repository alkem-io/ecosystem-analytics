# Stage 1: Build frontend
FROM node:20-alpine AS build-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS build-server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

COPY --from=build-server /app/server/package*.json ./
COPY --from=build-server /app/server/dist ./dist
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
