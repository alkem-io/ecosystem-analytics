#!/usr/bin/env bash
# Runs once, as the `node` user, after the dev container is created.
# Keep it idempotent — it may re-run on rebuilds.
set -euo pipefail

# The /home/node volumes seed with node ownership because their mount points are
# pre-created node-owned in the Dockerfile. The node_modules volumes cannot use
# that trick — they mount onto paths under /workspaces, which only exists at
# runtime as a bind mount — so they arrive empty and root-owned and have to be
# claimed here before pnpm can write to them.
echo "==> Claiming node_modules volume mount points"
sudo /usr/local/bin/claim-node-modules.sh

echo "==> Installing workspace dependencies (frontends + root tooling)"
pnpm install

echo "==> Installing server dependencies (standalone, not a workspace member)"
pnpm -C server install

# --- Bootstrap local env files from their committed defaults ------------
if [ -f server/.env.default ] && [ ! -f server/.env ]; then
  echo "==> Creating server/.env from server/.env.default (fill in secrets!)"
  cp server/.env.default server/.env
fi

echo ""
echo "============================================================"
echo " Dev container ready."
echo ""
echo "  Claude Code : run 'claude' in a terminal (login on first use)"
echo "  Dev servers : pnpm dev   (server + all three frontends)"
echo "  Explorer    : http://localhost:5173"
echo "  Visual tests: pnpm test:visual"
echo ""
echo "  NOTE: edit server/.env and add your OIDC secrets before"
echo "        starting the BFF."
echo "============================================================"
