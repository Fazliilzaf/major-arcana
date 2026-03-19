#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VERSION="${ARCANA_NODE_VERSION:-20.20.1}"

info() {
  printf '\n== %s ==\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    printf 'This script is intended for macOS only.\n' >&2
    exit 1
  fi
}

ensure_xcode_clt() {
  if xcode-select -p >/dev/null 2>&1; then
    printf 'Xcode Command Line Tools: OK\n'
    return 0
  fi

  warn "Xcode Command Line Tools are missing."
  warn "A macOS dialog may open now. Complete that install, then re-run this script."
  xcode-select --install || true
  exit 1
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    printf 'Homebrew: %s\n' "$(command -v brew)"
    return 0
  fi

  info "Installing Homebrew"
  if NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
    printf 'Homebrew: %s\n' "$(command -v brew)"
    return 0
  fi

  warn "Homebrew could not be installed non-interactively."
  warn "Continuing with user-level tool installation where possible."
  return 1
}

ensure_brew_shellenv() {
  if [[ ! -x /opt/homebrew/bin/brew ]]; then
    return 0
  fi

  local shellenv_line='eval "$(/opt/homebrew/bin/brew shellenv)"'

  if ! grep -Fqs "${shellenv_line}" "$HOME/.bash_profile" 2>/dev/null; then
    printf '%s\n' "${shellenv_line}" >> "$HOME/.bash_profile"
  fi
  if ! grep -Fqs "${shellenv_line}" "$HOME/.zprofile" 2>/dev/null; then
    printf '%s\n' "${shellenv_line}" >> "$HOME/.zprofile"
  fi

  eval "$(/opt/homebrew/bin/brew shellenv)"
}

install_user_level_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    printf 'Node: %s\n' "$(command -v node)"
    return 0
  fi

  local arch
  case "$(uname -m)" in
    arm64) arch="arm64" ;;
    x86_64) arch="x64" ;;
    *)
      warn "Unsupported architecture for user-level Node install: $(uname -m)"
      return 1
      ;;
  esac

  local install_root="${HOME}/.local"
  local link_dir="${install_root}/node"
  local archive_name="node-v${NODE_VERSION}-darwin-${arch}.tar.gz"
  local archive_url="https://nodejs.org/dist/v${NODE_VERSION}/${archive_name}"
  local extracted_dir="${install_root}/node-v${NODE_VERSION}-darwin-${arch}"
  local temp_dir

  info "Installing Node v${NODE_VERSION} locally"
  mkdir -p "${install_root}"
  temp_dir="$(mktemp -d)"

  curl -fsSL "${archive_url}" -o "${temp_dir}/${archive_name}"
  rm -rf "${extracted_dir}"
  tar -xzf "${temp_dir}/${archive_name}" -C "${install_root}"
  ln -sfn "${extracted_dir}" "${link_dir}"
  rm -rf "${temp_dir}"

  export PATH="${link_dir}/bin:${PATH}"
  printf 'Node: %s\n' "$(command -v node)"
  printf 'npm: %s\n' "$(command -v npm)"
}

install_packages() {
  if ! command -v brew >/dev/null 2>&1; then
    install_user_level_node
    return 0
  fi

  info "Installing developer tools"
  brew update
  brew install git node gh render python@3.14 ripgrep fd tmux direnv uv
  brew install --cask tailscale
}

install_repo_dependencies() {
  if [[ -f "${ROOT_DIR}/package.json" ]]; then
    info "Installing Arcana dependencies"
    (cd "${ROOT_DIR}" && npm ci)
  fi
}

install_arcana_commands() {
  if [[ -x "${ROOT_DIR}/scripts/install-arcana-commands.sh" ]]; then
    info "Installing Arcana commands"
    bash "${ROOT_DIR}/scripts/install-arcana-commands.sh"
  fi
}

print_versions() {
  info "Installed versions"
  printf 'git: '
  git --version
  if command -v node >/dev/null 2>&1; then
    printf 'node: '
    node -v
  else
    warn "node is not installed"
  fi
  if command -v npm >/dev/null 2>&1; then
    printf 'npm: '
    npm -v
  else
    warn "npm is not installed"
  fi
  if command -v gh >/dev/null 2>&1; then
    printf 'gh: '
    gh --version | head -n 1
  fi
  if command -v render >/dev/null 2>&1; then
    printf 'render: '
    render --version
  fi
  if [[ -x /opt/homebrew/bin/python3.14 ]]; then
    printf 'python3.14: '
    /opt/homebrew/bin/python3.14 --version
  elif command -v python3 >/dev/null 2>&1; then
    printf 'python3: '
    python3 --version
  fi
  if command -v rg >/dev/null 2>&1; then
    printf 'rg: '
    rg --version | head -n 1
  fi
  if command -v fd >/dev/null 2>&1; then
    printf 'fd: '
    fd --version
  fi
  if command -v tmux >/dev/null 2>&1; then
    printf 'tmux: '
    tmux -V
  fi
  if command -v uv >/dev/null 2>&1; then
    printf 'uv: '
    uv --version
  fi
  if command -v tailscale >/dev/null 2>&1; then
    printf 'tailscale: '
    tailscale version | head -n 1
  fi
}

print_codex_status() {
  info "Codex status"
  if command -v codex >/dev/null 2>&1; then
    printf 'codex: %s\n' "$(command -v codex)"
    return 0
  fi

  if [[ -x /Applications/Codex.app/Contents/Resources/codex ]]; then
    printf 'codex: /Applications/Codex.app/Contents/Resources/codex\n'
    return 0
  fi

  if [[ -x "${HOME}/Applications/Codex.app/Contents/Resources/codex" ]]; then
    printf 'codex: %s\n' "${HOME}/Applications/Codex.app/Contents/Resources/codex"
    return 0
  fi

  warn "Codex is not installed yet on this Mac."
  warn "Install the Codex app before using arcana-studio or local Codex workflows."
}

print_next_steps() {
  info "Next steps"
  cat <<EOF
1. Verify Tailscale:
   tailscale status

2. Log in to GitHub CLI:
   gh auth login -h github.com -p https -w

3. Verify Codex MCP:
   codex mcp list

4. Verify Arcana commands:
   arcana-doctor
   arcana-shell
EOF
}

main() {
  require_macos
  info "Arcana Apple workstation bootstrap"
  printf 'Repo reference: %s\n' "${ROOT_DIR}"
  ensure_xcode_clt
  ensure_homebrew || true
  ensure_brew_shellenv
  install_packages
  install_repo_dependencies
  install_arcana_commands
  print_versions
  print_codex_status
  print_next_steps
}

main "$@"
