# =====================================================================
# Ecosystem Analytics — development container
#
# This image is for LOCAL DEVELOPMENT inside VS Code Dev Containers (or
# any devcontainer-compatible tool), NOT for production. The production
# image is the multi-stage build in the repo-root Dockerfile.
#
# It provides everything needed to run the pnpm workspace (server BFF +
# the three frontend SPAs), the Playwright visual-regression suite, and
# the Claude Code CLI, all as the non-root `node` user — and it doubles
# as a locked-down Claude Code sandbox (outbound firewall + restricted
# sudo) for safe YOLO / bypass-permissions runs across git worktrees.
# =====================================================================
FROM node:22-bookworm

ARG TZ
ENV TZ="$TZ"

# --- Base CLI tooling ---------------------------------------------------
# gh (GitHub CLI), zsh + fzf for an interactive shell, firewall utilities
# (iptables/ipset/dnsutils/aggregate/jq) for init-firewall.sh, ripgrep for
# fast search (used by Claude Code), plus misc dev conveniences.
# (git is built from source below to get a modern release; the apt git in
# Debian bookworm is stuck at 2.39.)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
  apt-get install -y --no-install-recommends \
    less procps sudo fzf zsh man-db unzip gnupg2 \
    iptables ipset iproute2 dnsutils aggregate jq ca-certificates \
    curl wget nano vim ripgrep && \
  # GitHub CLI (apt repo)
  mkdir -p -m 755 /etc/apt/keyrings && \
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg && \
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list && \
  apt-get update && apt-get install -y --no-install-recommends gh && \
  rm -rf /var/lib/apt/lists/*

# --- Modern git from source (~2.5x) -------------------------------------
# Debian bookworm's apt git is 2.39; build a current release instead.
ARG GIT_VERSION=2.51.0
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
  apt-get install -y --no-install-recommends \
    build-essential dh-autoreconf libcurl4-gnutls-dev libexpat1-dev \
    gettext libz-dev libssl-dev && \
  curl -fsSL "https://www.kernel.org/pub/software/scm/git/git-${GIT_VERSION}.tar.gz" \
    -o /tmp/git.tar.gz && \
  tar -xzf /tmp/git.tar.gz -C /tmp && \
  cd "/tmp/git-${GIT_VERSION}" && \
  make -j"$(nproc)" prefix=/usr/local all && \
  make prefix=/usr/local install && \
  cd / && rm -rf "/tmp/git-${GIT_VERSION}" /tmp/git.tar.gz && \
  apt-get purge -y build-essential dh-autoreconf && \
  apt-get autoremove -y && \
  rm -rf /var/lib/apt/lists/* && \
  git --version

# --- Persisted shell history --------------------------------------------
# Mount point for the ea-commandhistory volume (bash + zsh history).
RUN mkdir /commandhistory && \
  touch /commandhistory/.bash_history && \
  chown -R node:node /commandhistory

ENV DEVCONTAINER=true

# --- Restricted sudo ----------------------------------------------------
# The `node` user may run ONLY the firewall installer as root (via sudo).
# Everything else runs unprivileged — the sandbox's second line of defence
# after the outbound firewall.
RUN echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall

# --- pnpm (pinned to the repo's packageManager version) via corepack ----
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# --- Claude Code CLI ----------------------------------------------------
# Installed globally so `claude` is on PATH for every shell in the container.
RUN npm install -g @anthropic-ai/claude-code

# --- Playwright browsers + OS dependencies ------------------------------
# Installed into a shared, world-readable location so any user in the
# container resolves the same browsers. Pinned to the repo's Playwright
# version. PLAYWRIGHT_BROWSERS_PATH must match at runtime (set again in
# devcontainer.json containerEnv). Baked in at build time so no download is
# needed at runtime once the firewall is up.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@1.58.2 install --with-deps chromium \
  && chmod -R a+rx /ms-playwright

# --- Firewall installer -------------------------------------------------
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

# --- Node-owned mount points --------------------------------------------
# Pre-create the dirs that named volumes mount onto, owned by `node`, so a
# fresh volume seeds with node ownership instead of root. Covers the Claude
# config/credentials and the persistent pnpm store.
ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN mkdir -p /home/node/.claude /home/node/.local/share/pnpm/store && \
  chown -R node:node /home/node/.claude /home/node/.local/share/pnpm

# --- Interactive shell config -------------------------------------------
# zsh is the default terminal profile (see devcontainer.json); without a
# .zshrc it falls back to the bare `<hostname>%` prompt. Ship a git-aware
# prompt + persisted history.
COPY --chown=node:node zshrc /home/node/.zshrc

USER node

# bash history persistence (bash is the non-interactive default shell).
RUN echo 'export PROMPT_COMMAND="history -a"' >> /home/node/.bashrc && \
  echo 'export HISTFILE=/commandhistory/.bash_history' >> /home/node/.bashrc

WORKDIR /workspaces
