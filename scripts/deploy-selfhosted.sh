#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

cd /home/fazli/major-arcana-legacy

echo "[deploy] pulling latest code..."
git pull origin main

echo "[deploy] installing dependencies..."
npm ci

echo "[deploy] building bundle..."
npm run build:bundle

echo "[deploy] restarting service..."
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id - u)}"
systemctl --user daemon-reload
systemctl --user restart majorarcana-legacy.service

echo "[deploy] done. http://localhost:3000"
