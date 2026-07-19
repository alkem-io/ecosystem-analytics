#!/bin/bash
# Outbound network allowlist for the ecosystem-analytics Claude Code sandbox.
#
# Default policy is DENY. Only the hosts needed to develop and run this
# workspace safely in YOLO / bypass-permissions mode are reachable: the
# Anthropic API, the npm registry, GitHub (source control + release flow via
# the gh CLI), and Alkemio (the BFF's OIDC issuer + GraphQL backend, so
# `pnpm dev` keeps working under lockdown).
#
# Runs once as root at container create (see devcontainer.json postCreateCommand).
set -euo pipefail
IFS=$'\n\t'

echo "[init-firewall] resetting iptables + ipset ..."
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# Allow DNS (needed to resolve the allowlist itself) and localhost before locking down.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT

ipset create allowed-domains hash:net

# GitHub publishes its IP ranges via the meta API — pull web/api/git CIDRs.
echo "[init-firewall] fetching GitHub IP ranges ..."
gh_ranges="$(curl -fsSL https://api.github.com/meta)"
if [ -z "$gh_ranges" ] || ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
  echo "[init-firewall] ERROR: could not fetch GitHub IP ranges" >&2
  exit 1
fi
echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q | while read -r cidr; do
  [ -z "$cidr" ] && continue
  ipset add allowed-domains "$cidr" 2>/dev/null || true
done

# Resolve the remaining allowlisted hosts to A records and add each /32.
for domain in \
    registry.npmjs.org \
    api.anthropic.com \
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
  for ip in $ips; do
    ipset add allowed-domains "$ip" 2>/dev/null || true
  done
done

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
