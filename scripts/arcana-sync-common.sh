#!/usr/bin/env bash
set -euo pipefail

ARCANA_SYNC_PATHS=(
  ".env.example"
  "AGENTS.md"
  "README.md"
  "bin"
  "data"
  "docs/ops/imac-setup-sv.md"
  "docs/ops/mac-studio-setup-sv.md"
  "knowledge"
  "package-lock.json"
  "package.json"
  "prompts"
  "public"
  "render.yaml"
  "scripts"
  "server.js"
  "src"
  "tests"
  "wordpress"
)

build_arcana_sync_args() {
  local root_dir="$1"
  local path

  ARCANA_SYNC_ARGS=()
  for path in "${ARCANA_SYNC_PATHS[@]}"; do
    if [[ -e "${root_dir}/${path}" ]]; then
      ARCANA_SYNC_ARGS+=("${root_dir}/${path}")
    fi
  done
}
