#!/usr/bin/env bash
# Runs once, as the `node` user, after the dev container is created.
# Keep it idempotent — it may re-run on rebuilds.
set -euo pipefail

# Named volumes seed with node ownership because their mount points are
# pre-created node-owned in the Dockerfile — no runtime chown needed (and
# `node` can only sudo the firewall installer, so a chown here would fail).

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
