#!/usr/bin/env bash
# ==============================================================================
# Texvic AI - Autonomous VPS Deployment Watcher
# ==============================================================================
# Automatically checks GitHub for new commits on 'main'.
# If new code is found, pulls updates, rebuilds the container incrementally,
# and cleans up stale Docker images.
#
# Usage:
#   ./scripts/auto-deploy.sh           # Run once (ideal for cron)
#   ./scripts/auto-deploy.sh --daemon  # Run continuously every 45s (ideal for systemd)
# ==============================================================================

set -o pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

LOCK_FILE="/tmp/texvic-autodeploy.lock"
POLL_INTERVAL=45

check_and_deploy() {
    # Ensure only one deploy runs at a time
    if [ -f "$LOCK_FILE" ]; then
        PID=$(cat "$LOCK_FILE" 2>/dev/null || true)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            return 0
        fi
    fi
    echo $$ > "$LOCK_FILE"

    # Fetch latest commits from remote origin
    git fetch origin main --quiet 2>/dev/null || true

    LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null || echo "local_err")
    REMOTE_HASH=$(git rev-parse origin/main 2>/dev/null || echo "remote_err")

    if [ "$LOCAL_HASH" != "$REMOTE_HASH" ] && [ "$REMOTE_HASH" != "remote_err" ]; then
        echo "=================================================================="
        echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] 🚀 New update detected on GitHub!"
        echo "Local:  $LOCAL_HASH"
        echo "Remote: $REMOTE_HASH"
        echo "------------------------------------------------------------------"
        echo "📥 Pulling latest changes..."
        git pull origin main

        echo "🔨 Building and launching updated Docker container..."
        docker compose up -d --build

        echo "🧹 Pruning dangling Docker build layers..."
        docker image prune -f >/dev/null 2>&1 || true

        echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] ✅ Texvic AI successfully updated and running!"
        echo "=================================================================="
    fi

    rm -f "$LOCK_FILE"
}

if [ "$1" = "--daemon" ]; then
    echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] 🛰️ Texvic AI Auto-Deploy Daemon started (checking every ${POLL_INTERVAL}s)..."
    while true; do
        check_and_deploy
        sleep "$POLL_INTERVAL"
    done
else
    check_and_deploy
fi
