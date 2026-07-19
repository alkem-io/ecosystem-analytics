# Dev Container

A ready-to-use development environment for Ecosystem Analytics, plus the
Claude Code CLI, all running inside a container. This is **for development
only** — production uses the multi-stage build in the repo-root `Dockerfile`.

It also doubles as a locked-down **Claude Code sandbox**: an outbound network
firewall + restricted `sudo` make it safe to run Claude in YOLO /
bypass-permissions mode, and the mount is worktree-aware so you can run several
`ecosystem-analytics` worktrees in parallel, each in its own container.

## What's inside

- **Node 22 + pnpm 11.7.0** (pinned to the repo's `packageManager`)
- **git 2.51.0** built from source (Debian bookworm's apt git is stuck at 2.39)
- **Playwright + Chromium** (browsers preinstalled at `/ms-playwright`) so
  `pnpm test:visual` runs in-container
- **GitHub CLI (`gh`)**, plus `fzf`, `jq`, `ripgrep`, `vim`, `nano`, `wget`, …
- **Claude Code CLI** (`claude`) installed globally
- **zsh** as the default terminal, with a git-aware prompt and persisted history
- **Outbound firewall** (`init-firewall.sh`) — default-deny with an allowlist
- Runs as the non-root `node` user with **restricted `sudo`** (firewall only)

## Prerequisites

- Docker (Desktop or Engine)
- One of:
  - **VS Code** + the *Dev Containers* extension, or
  - the **`@devcontainers/cli`** (`npm i -g @devcontainers/cli`)

## Worktree-aware mount (parallel edits)

Unlike a plain devcontainer that mounts just the project folder, this one mounts
the **shared parent** `/Users/neilsmyth/Documents/DevAlkemio` at `/workspaces`
and points `workspaceFolder` at whichever leaf you opened
(`/workspaces/${localWorkspaceFolderBasename}`).

Why: a git **worktree**'s `.git` is only a pointer into the main clone's gitdir,
which lives outside the leaf folder. Mounting the leaf alone breaks git inside
the container. Mounting the parent keeps every worktree's gitdir visible, so you
can spin up multiple `ecosystem-analytics` worktrees at once — each opens as its
own container but they **share** the Claude login, pnpm store, and shell history
(fixed-name volumes, see below).

To make worktrees resolve cleanly inside the container, set up relative gitdir
links on the **host** once:

```bash
git config --global worktree.useRelativePaths true   # new worktrees use relative links
git worktree repair                                  # fix existing worktrees' links
```

> ⚠️ The mount `source` is a **hardcoded host path**
> (`/Users/neilsmyth/Documents/DevAlkemio`). If your checkout moves, edit that
> one line in `devcontainer.json`.

## Networking (firewall)

`init-firewall.sh` runs once at create (as root, the only thing `node` may
`sudo`) and installs a default-**deny** outbound policy. Reachable hosts:

- Anthropic API (`api.anthropic.com`, `statsig.anthropic.com`, `sentry.io`)
- npm registry (`registry.npmjs.org`)
- GitHub (its published web/api/git CIDR ranges, `ghcr.io`, `codeload`, …)
- **Alkemio** (`alkem.io`, `identity.alkem.io`, + `acc-` variants) so the BFF's
  OIDC login + GraphQL calls keep working under lockdown

Everything else is blocked. If you add a dependency that fetches from a new host,
add it to the allowlist in `init-firewall.sh`.

> The firewall is installed at container **create**. A `docker stop`/`start`
> loses the iptables rules — rebuild, or re-run
> `sudo /usr/local/bin/init-firewall.sh`, to restore them.

## Persistence (shared volumes)

Fixed-name volumes are shared across all worktree containers:

| Volume            | Mount                              | Purpose                     |
| ----------------- | ---------------------------------- | --------------------------- |
| `ea-claude`       | `/home/node/.claude`               | Claude login + settings     |
| `ea-pnpm-store`   | `/home/node/.local/share/pnpm/store` | pnpm content-addressed store |
| `ea-commandhistory` | `/commandhistory`                | bash + zsh history          |

So you log in / download packages **once**, not per worktree.

## Start it

### VS Code

1. Open the repo (or a worktree of it) in VS Code.
2. Command Palette → **Dev Containers: Reopen in Container**.
3. First build takes a few minutes (git is compiled from source); `post-create.sh`
   then installs all workspace + server dependencies, and the firewall locks the
   network down.

### CLI

```bash
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . zsh
```

## Interacting with Claude inside the container

Open a terminal in the container and run:

```bash
claude
```

On first use it will prompt you to authenticate. Your login is persisted in the
`ea-claude` volume and shared across worktrees, so you stay logged in.

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
