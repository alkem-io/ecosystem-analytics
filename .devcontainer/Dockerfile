# =====================================================================
# Ecosystem Analytics — development container
#
# This image is for LOCAL DEVELOPMENT inside VS Code Dev Containers (or
# any devcontainer-compatible tool), NOT for production. The production
# image is the multi-stage build in the repo-root Dockerfile.
#
# It provides everything needed to run the pnpm workspace (server BFF +
# the three frontend SPAs), the Playwright visual-regression suite, and
# the Claude Code CLI, all as the non-root `node` user.
# =====================================================================
FROM node:22-bookworm

# --- pnpm (pinned to the repo's packageManager version) via corepack ----
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

# --- Base CLI tooling ---------------------------------------------------
# git + gh (GitHub CLI) for source control, plus a few conveniences that
# make an interactive shell pleasant (sudo lets the `node` user install
# extra packages on the fly during development).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    gnupg \
    sudo \
    less \
    procps \
    ripgrep \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
     | dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
     > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# --- Claude Code CLI ----------------------------------------------------
# Installed globally so `claude` is on PATH for every shell in the container.
RUN npm install -g @anthropic-ai/claude-code

# --- Playwright browsers + OS dependencies ------------------------------
# Installed into a shared, world-readable location so any user in the
# container resolves the same browsers. Pinned to the repo's Playwright
# version. PLAYWRIGHT_BROWSERS_PATH must match at runtime (set again in
# devcontainer.json containerEnv).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@1.58.2 install --with-deps chromium \
  && chmod -R a+rx /ms-playwright

# --- Passwordless sudo for the built-in `node` user ---------------------
RUN echo 'node ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/node \
  && chmod 0440 /etc/sudoers.d/node

# pnpm global bin + a persistent store live under the node user's home.
ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

USER node
WORKDIR /workspace
