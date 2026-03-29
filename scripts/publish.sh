#!/bin/bash
# Publish all packages to npm in dependency order
# Usage: ./scripts/publish.sh [--dry-run]
#
# Dependency order:
#   core
#   -> storage-sqlite, storage-redis, storage-postgres  (depend on core)
#   -> adapter-coze, adapter-dify, adapter-direct, adapter-openclaw  (depend on core)
#   -> scene-codenames, scene-werewolf  (depend on core)
#   -> gateway  (depends on core)
#   -> cli  (depends on core + gateway)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--dry-run]"
      exit 1
      ;;
  esac
done

if $DRY_RUN; then
  echo "[publish] DRY RUN mode — no packages will actually be published"
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "[publish] $*"
}

die() {
  echo "[publish] ERROR: $*" >&2
  exit 1
}

# Check whether a specific version of a package already exists on npm.
# Returns 0 (exists) or 1 (does not exist / error).
version_exists() {
  local pkg_name="$1"
  local pkg_version="$2"
  npm view "${pkg_name}@${pkg_version}" version >/dev/null 2>&1
}

# Publish a single package located at packages/<name>.
publish_package() {
  local name="$1"
  local pkg_dir="${REPO_ROOT}/packages/${name}"

  if [ ! -f "${pkg_dir}/package.json" ]; then
    die "package.json not found in ${pkg_dir}"
  fi

  local pkg_name
  pkg_name="$(node -e "process.stdout.write(require('${pkg_dir}/package.json').name)")"
  local pkg_version
  pkg_version="$(node -e "process.stdout.write(require('${pkg_dir}/package.json').version)")"
  local is_private
  is_private="$(node -e "process.stdout.write(String(require('${pkg_dir}/package.json').private || false))")"

  if [ "$is_private" = "true" ]; then
    log "Skipping ${pkg_name}@${pkg_version} (private=true)"
    return 0
  fi

  log "Checking ${pkg_name}@${pkg_version} ..."

  if version_exists "$pkg_name" "$pkg_version"; then
    log "SKIP ${pkg_name}@${pkg_version} — already published on npm"
    return 0
  fi

  if ! $DRY_RUN; then
    log "Publishing ${pkg_name}@${pkg_version} ..."
    (cd "${pkg_dir}" && npm publish --access public)
    log "Published ${pkg_name}@${pkg_version}"
  else
    log "DRY RUN: would publish ${pkg_name}@${pkg_version}"
  fi
}

# ---------------------------------------------------------------------------
# Pre-flight: verify required tools
# ---------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "node is required but not found in PATH"
command -v pnpm >/dev/null 2>&1 || die "pnpm is required but not found in PATH"
command -v npm  >/dev/null 2>&1 || die "npm is required but not found in PATH"

node_version="$(node --version | sed 's/v//')"
node_major="${node_version%%.*}"
if [ "$node_major" -lt 20 ]; then
  die "Node.js >= 20 is required (found v${node_version})"
fi

# ---------------------------------------------------------------------------
# Step 1: Build all packages
# ---------------------------------------------------------------------------
log "Building all packages ..."
(cd "${REPO_ROOT}" && pnpm build)
log "Build complete."

# ---------------------------------------------------------------------------
# Step 2: Run all tests
# ---------------------------------------------------------------------------
log "Running tests ..."
(cd "${REPO_ROOT}" && pnpm test)
log "All tests passed."

# ---------------------------------------------------------------------------
# Step 3: Publish in dependency order
# ---------------------------------------------------------------------------
log "Publishing packages in dependency order ..."

# Tier 1 — no internal deps
publish_package "core"

# Tier 2 — depend only on core
publish_package "storage-sqlite"
publish_package "storage-redis"
publish_package "storage-postgres"
publish_package "adapter-coze"
publish_package "adapter-dify"
publish_package "adapter-direct"
publish_package "adapter-openclaw"
publish_package "scene-codenames"
publish_package "scene-werewolf"

# Tier 3 — depends on core (gateway)
publish_package "gateway"

# Tier 4 — depends on core + gateway (cli)
publish_package "cli"

log "All packages processed."
if $DRY_RUN; then
  log "DRY RUN complete — no packages were actually published."
else
  log "Publish complete."
fi
