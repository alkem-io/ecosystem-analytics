# Dev Container

A ready-to-use development environment for Ecosystem Analytics, plus the
Claude Code CLI, all running inside a container. This is **for development
only** — production uses the multi-stage build in the repo-root `Dockerfile`.

## What's inside

- **Node 22 + pnpm 11.7.0** (pinned to the repo's `packageManager`)
- **Playwright + Chromium** (browsers preinstalled at `/ms-playwright`) so
  `pnpm test:visual` runs in-container
- **git + GitHub CLI (`gh`)**
- **Claude Code CLI** (`claude`) installed globally
- Runs as the non-root `node` user with passwordless `sudo`

## Prerequisites

- Docker (Desktop or Engine)
- One of:
  - **VS Code** + the *Dev Containers* extension, or
  - the **`@devcontainers/cli`** (`npm i -g @devcontainers/cli`)

## Start it

### VS Code

1. Open the repo in VS Code.
2. Command Palette → **Dev Containers: Reopen in Container**.
3. First build takes a few minutes; `post-create.sh` then installs all
   workspace + server dependencies automatically.

### CLI

```bash
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . bash
```

## Interacting with Claude inside the container

Open a terminal in the container and run:

```bash
claude
```

On first use it will prompt you to authenticate. Your login and settings are
persisted in a named volume (`ea-claude-config-*`), so you stay logged in
across rebuilds.

## Running the app

```bash
pnpm dev          # BFF + all three frontends (server, explorer, vng, govtech)
```

Forwarded ports (auto-forwarded by VS Code):

| Port | Service        |
| ---- | -------------- |
| 4100 | BFF (server)   |
| 4101 | BFF vng        |
| 4102 | BFF govtech    |
| 5173 | Explorer SPA   |
| 5174 | VNG SPA        |
| 5175 | GovTech SPA    |

> **Before starting the BFF**, edit `server/.env` (auto-created from
> `server/.env.default` on first create) and fill in the OIDC secrets.

## Visual regression tests

```bash
pnpm test:visual
```

Chromium and its OS dependencies are already baked into the image.
