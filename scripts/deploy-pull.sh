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

BEFORE_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "==> Fetching ${REMOTE}/${BRANCH}..."
git fetch "$REMOTE" "$BRANCH"

echo "==> Resetting to ${REMOTE}/${BRANCH} (discards local code/data edits)..."
git reset --hard "${REMOTE}/${BRANCH}"

AFTER_SHA="$(git rev-parse --short HEAD)"
echo "==> Git: ${BEFORE_SHA} -> ${AFTER_SHA}"

echo "==> Restoring versioned project data from repository..."
git checkout HEAD -- \
  projects/data/store.json \
  projects/uploads \
  generated_proposals \
  2>/dev/null || true

# Stamp build version so the UI/API can confirm which commit is live.
BUILD_FILE="projects/public/build-version.txt"
echo "${AFTER_SHA}" > "$BUILD_FILE"
echo "==> Wrote ${BUILD_FILE} (${AFTER_SHA})"

# Sanity check: new UI should NOT list atas inside each delivery phase card.
if grep -q "label: 'Atas'" projects/public/delivery-os-ui.js 2>/dev/null; then
  echo "WARNING: delivery-os-ui.js still contains per-phase Atas sections (old UI)." >&2
else
  echo "==> UI check OK: atas are not rendered per delivery phase."
fi

if [[ -f server/package.json ]]; then
  echo "==> Installing server dependencies..."
  (cd server && npm install --production)
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files yourlab.service >/dev/null 2>&1; then
  echo "==> Restarting yourlab service..."
  sudo systemctl restart yourlab
  sleep 2
  if systemctl is-active --quiet yourlab; then
    echo "==> yourlab service is active."
  else
    echo "ERROR: yourlab service failed to start. Check: sudo journalctl -u yourlab -n 40" >&2
    exit 1
  fi
fi

echo ""
echo "==> Deploy complete."
echo "    Commit: ${AFTER_SHA}"
echo "    Verify: curl -s http://127.0.0.1:3000/api/projects/version"
echo "    Browser: hard refresh /projects (Ctrl+Shift+R) or purge Cloudflare cache if needed."
