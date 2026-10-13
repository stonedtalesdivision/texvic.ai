#!/usr/bin/env bash
# ==============================================================================
# Texvic AI - Install Systemd Auto-Deploy Service on VPS
# ==============================================================================
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_USER="$(whoami)"

echo "🔧 Setting up Texvic AI Auto-Deploy Service..."
chmod +x "$REPO_DIR/scripts/auto-deploy.sh"

SERVICE_FILE="/etc/systemd/system/texvic-autodeploy.service"

echo "📝 Creating systemd service at $SERVICE_FILE..."
sudo bash -c "cat <<EOF > $SERVICE_FILE
[Unit]
Description=Texvic AI Auto-Deploy Watcher
After=network.target docker.service

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$REPO_DIR
ExecStart=/bin/bash $REPO_DIR/scripts/auto-deploy.sh --daemon
Restart=always
RestartSec=15
StandardOutput=append:$REPO_DIR/data/autodeploy.log
StandardError=append:$REPO_DIR/data/autodeploy.log

[Install]
WantedBy=multi-user.target
EOF"

echo "🔄 Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "🚀 Enabling and starting texvic-autodeploy.service..."
sudo systemctl enable texvic-autodeploy.service
sudo systemctl restart texvic-autodeploy.service

echo ""
echo "=================================================================="
echo "✅ Auto-Deploy Service is ACTIVE and RUNNING!"
echo "Status check: sudo systemctl status texvic-autodeploy"
echo "Live logs:    tail -f $REPO_DIR/data/autodeploy.log"
echo "=================================================================="
