#!/usr/bin/env bash
# Pull latest code and OVERWRITE local project data with the repository version.
# Use this on the production server so requirements/documents match what was
# committed from the local dev environment (store.json, uploads, proposals).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="${DEPLOY_BRANCH:-master}"

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  : # local branch exists
elif git rev-parse --verify "${REMOTE}/${BRANCH}" >/dev/null 2>&1; then
  git checkout -B "$BRANCH" "${REMOTE}/${BRANCH}"
else
  echo "Branch ${REMOTE}/${BRANCH} not found." >&2
  exit 1
fi

echo "==> Fetching ${REMOTE}/${BRANCH}..."
git fetch "$REMOTE" "$BRANCH"

echo "==> Resetting to ${REMOTE}/${BRANCH} (discards local code/data edits)..."
git reset --hard "${REMOTE}/${BRANCH}"

echo "==> Restoring versioned project data from repository..."
git checkout HEAD -- \
  projects/data/store.json \
  projects/uploads \
  generated_proposals \
  2>/dev/null || true

if [[ -d server/package.json ]] || [[ -f server/package.json ]]; then
  echo "==> Installing server dependencies..."
  (cd server && npm install --production)
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files yourlab.service >/dev/null 2>&1; then
  echo "==> Restarting yourlab service..."
  sudo systemctl restart yourlab
fi

echo "==> Deploy complete. Project data now matches ${REMOTE}/${BRANCH}."
