#!/usr/bin/env bash
# Kanoniska Render prod-defaults (Frankfurt). Source: scripts/render-prod-defaults.sh
export RENDER_PROD_SERVICE_ID="${RENDER_PROD_SERVICE_ID:-srv-d8b3i3tckfvc73clgeng}"
export RENDER_PROD_SERVICE_NAME="${RENDER_PROD_SERVICE_NAME:-arcana}"
export RENDER_PROD_URL="${RENDER_PROD_URL:-https://arcana.hairtpclinic.com}"
export RENDER_PROD_ONRENDER_URL="${RENDER_PROD_ONRENDER_URL:-https://major-arcana-frankfurt.onrender.com}"
# Legacy alias — skript som redan använder RENDER_SERVICE_ID
export RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-$RENDER_PROD_SERVICE_ID}"
