#!/bin/bash
# Hand the `node` user ownership of the node_modules volume mount points.
#
# Why this exists: devcontainer.json mounts a named volume over every
# node_modules directory so the container's Linux install never collides with
# the host's macOS install in the shared bind mount. Docker seeds a fresh named
# volume from the IMAGE path it covers — and these paths live under /workspaces,
# which only exists at runtime as a bind mount. So there is nothing to seed from
# and the volume arrives empty and root-owned, which makes `pnpm install` fail
# with EACCES for the non-root `node` user.
#
# Runs as root via the restricted sudoers entry (see Dockerfile), called from
# post-create.sh before any install. Idempotent.
set -euo pipefail
shopt -s nullglob

claimed=0
for dir in \
    /workspaces/*/node_modules \
    /workspaces/*/*/node_modules \
    /workspaces/*/*/*/node_modules; do
  [ -d "$dir" ] || continue

  # Only ever touch a real mount point — i.e. a directory on a different device
  # from its parent. That is precisely the set of named volumes from
  # devcontainer.json, and it guarantees this never chowns a plain directory
  # inside the bind-mounted source tree. Comparing st_dev needs only coreutils,
  # so there is no dependency on `mountpoint` being installed.
  [ "$(stat -c %d "$dir")" = "$(stat -c %d "$(dirname "$dir")")" ] && continue

  [ "$(stat -c %U "$dir")" = "node" ] && continue

  chown node:node "$dir"
  echo "[claim-node-modules] chown node:node $dir"
  claimed=$((claimed + 1))
done

echo "[claim-node-modules] claimed $claimed mount point(s)"
