#!/bin/bash
# Outbound network allowlist for the ecosystem-analytics Claude Code sandbox.
#
# Default policy is DENY. Only the hosts needed to develop and run this
# workspace safely in YOLO / bypass-permissions mode are reachable: the
# Anthropic API, the npm registry, GitHub (source control + release flow via
# the gh CLI), and Alkemio (the BFF's OIDC issuer + GraphQL backend, so
# `pnpm dev` keeps working under lockdown).
#
# Runs as root at container create (see devcontainer.json postCreateCommand),
# and is safe to re-run by hand afterwards to pick up allow-list edits.
set -euo pipefail
IFS=$'\n\t'

# ===========================================================================
# Phase 1 — resolve everything over the network BEFORE touching iptables.
#
# This script has to be re-runnable inside a container whose firewall is
# ALREADY active, and the network work is the only part that can fail. Doing
# it first means a failure here (GitHub meta unreachable, DNS hiccup) exits
# with the existing firewall untouched. Doing it after the flush — as this
# script used to — left the container with no rules and a still-DROP policy:
# a total blackout that also killed the Claude Code session running it.
# ===========================================================================

# GitHub publishes its IP ranges via the meta API — pull web/api/git CIDRs.
echo "[init-firewall] fetching GitHub IP ranges ..."
gh_ranges="$(curl -fsSL https://api.github.com/meta)"
if [ -z "$gh_ranges" ] || ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
  echo "[init-firewall] ERROR: could not fetch GitHub IP ranges" >&2
  exit 1
fi
allowed_nets="$(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)"

# Resolve the remaining allowlisted hosts to A records and collect each /32.
#
# claude.ai backs Claude Code's Remote Control / session creation — without it
# the CLI connects but Remote Control reports "Session creation failed".
#
# tiles.openfreemap.org serves the map basemap (feature 021). Without it every
# map in the container silently renders its no-imagery fallback, which looks
# like a bug in the map code rather than a blocked host.
#
# CARTO is deliberately absent: feature 021 removed the raster basemap entirely,
# and it was never on this allow-list anyway — which is why maps had never drawn
# imagery inside a firewalled container. tiles.openfreemap.org is a single host
# with no shard subdomains, so one entry covers it.
for domain in \
    registry.npmjs.org \
    tiles.openfreemap.org \
    api.anthropic.com \
    claude.ai \
    console.anthropic.com \
    statsig.anthropic.com \
    sentry.io \
    objects.githubusercontent.com \
    codeload.github.com \
    ghcr.io \
    pkg-containers.githubusercontent.com \
    alkem.io \
    identity.alkem.io \
    acc-alkem.io \
    identity.acc-alkem.io; do
  echo "[init-firewall] resolving $domain ..."
  ips="$(dig +short A "$domain" | grep -E '^[0-9.]+$' || true)"
  if [ -z "$ips" ]; then
    echo "[init-firewall]   no A record — skipped"
    continue
  fi
  allowed_nets="$allowed_nets"$'\n'"$ips"
done

# ===========================================================================
# Phase 2 — apply. Everything below is local; nothing here needs the network.
# ===========================================================================
echo "[init-firewall] applying ruleset ..."

# `iptables -F` flushes RULES but leaves the chain POLICY alone, so on a re-run
# the policy is still DROP from the previous run. Reset it explicitly first,
# or the flush cuts the container off from the moment it lands.
iptables -P INPUT   ACCEPT
iptables -P OUTPUT  ACCEPT
iptables -P FORWARD ACCEPT
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

ipset create allowed-domains hash:net
while read -r net; do
  [ -z "$net" ] && continue
  ipset add allowed-domains "$net" 2>/dev/null || true
done <<< "$allowed_nets"
echo "[init-firewall] allow-list has $(ipset list allowed-domains | awk '/^Number of entries:/ {print $4}') entries"

# Allow DNS (needed to resolve the allowlist on the next run) and localhost.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT

# Detect the host/docker network so DevContainer <-> host traffic keeps working.
HOST_IP="$(ip route | awk '/default/ {print $3; exit}')"
if [ -n "${HOST_IP:-}" ]; then
  HOST_NET="$(echo "$HOST_IP" | sed 's/\.[0-9]*$/.0\/24/')"
  iptables -A INPUT  -s "$HOST_NET" -j ACCEPT
  iptables -A OUTPUT -d "$HOST_NET" -j ACCEPT
fi

# Keep established/related connections, then allow only the allowlist. Deny the rest.
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

iptables -P INPUT   DROP
iptables -P OUTPUT  DROP
iptables -P FORWARD DROP

echo "[init-firewall] verifying ..."
if curl -fs --max-time 5 https://example.com >/dev/null 2>&1; then
  echo "[init-firewall] ERROR: firewall leaks — example.com is reachable" >&2
  exit 1
fi
if ! curl -fs --max-time 5 https://api.github.com/zen >/dev/null 2>&1; then
  echo "[init-firewall] ERROR: firewall too strict — api.github.com is blocked" >&2
  exit 1
fi
echo "[init-firewall] OK — outbound restricted to Anthropic + npm + GitHub + Alkemio."
