#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${ROOT_DIR}/bin"
USER_BIN_DIR="${HOME}/.npm-global/bin"
BREW_BIN_DIR="/opt/homebrew/bin"
USR_LOCAL_BIN_DIR="/usr/local/bin"
DESKTOP_SHARE_COMMAND="${HOME}/Desktop/starta-macstudio-skarmdelning.command"
SYSTEM_CODEX_BIN="/Applications/Codex.app/Contents/Resources/codex"
USER_CODEX_BIN="${HOME}/Applications/Codex.app/Contents/Resources/codex"

ensure_line() {
  local file_path="$1"
  local line="$2"

  mkdir -p "$(dirname "${file_path}")"
  touch "${file_path}"
  if ! grep -Fqx "${line}" "${file_path}" 2>/dev/null; then
    printf '%s\n' "${line}" >> "${file_path}"
  fi
}

remove_line() {
  local file_path="$1"
  local line="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  local temp_file
  temp_file="$(mktemp)"
  grep -Fvx "${line}" "${file_path}" > "${temp_file}" || true
  mv "${temp_file}" "${file_path}"
}

ensure_link() {
  local source_path="$1"
  local target_path="$2"

  mkdir -p "$(dirname "${target_path}")"
  ln -sfn "${source_path}" "${target_path}"
}

remove_path_if_present() {
  local target_path="$1"

  if [[ -L "${target_path}" || -e "${target_path}" && ! -d "${target_path}" ]]; then
    rm -f "${target_path}"
  fi
}

write_desktop_share_command() {
  cat > "${DESKTOP_SHARE_COMMAND}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ -x /opt/homebrew/bin/arcana-share ]; then
  exec /opt/homebrew/bin/arcana-share
fi

if [ -x "$HOME/.npm-global/bin/arcana-share" ]; then
  exec "$HOME/.npm-global/bin/arcana-share"
fi

printf 'arcana-share ar inte installerat.\n' >&2
printf 'Kor: cd "$HOME/Desktop/Arcana" && bash ./scripts/install-arcana-commands.sh\n' >&2
exit 1
EOF
  chmod +x "${DESKTOP_SHARE_COMMAND}"
}

install_codex_link_if_safe() {
  local source_path="$1"
  local target_path="$2"

  if [[ -e "${target_path}" && ! -L "${target_path}" ]]; then
    return 0
  fi

  ensure_link "${source_path}" "${target_path}"
}

BREW_SHELLENV_LINE='if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi'
OLD_BREW_SHELLENV_LINE='eval "$(/opt/homebrew/bin/brew shellenv)"'
CODEX_PATH_LINE='if [ -d /Applications/Codex.app/Contents/Resources ]; then export PATH="/Applications/Codex.app/Contents/Resources:$PATH"; fi; if [ -d "$HOME/Applications/Codex.app/Contents/Resources" ]; then export PATH="$HOME/Applications/Codex.app/Contents/Resources:$PATH"; fi'
LOCAL_NODE_PATH_LINE='if [ -d "$HOME/.local/node/bin" ]; then export PATH="$HOME/.local/node/bin:$PATH"; fi'

remove_line "${HOME}/.bash_profile" "${OLD_BREW_SHELLENV_LINE}"
remove_line "${HOME}/.bashrc" "${OLD_BREW_SHELLENV_LINE}"
remove_line "${HOME}/.zprofile" "${OLD_BREW_SHELLENV_LINE}"

ensure_line "${HOME}/.bash_profile" "${BREW_SHELLENV_LINE}"
ensure_line "${HOME}/.bash_profile" "${CODEX_PATH_LINE}"
ensure_line "${HOME}/.bash_profile" "${LOCAL_NODE_PATH_LINE}"
ensure_line "${HOME}/.bash_profile" 'export PATH="$HOME/.npm-global/bin:$PATH"'
ensure_line "${HOME}/.bash_profile" 'export BASH_SILENCE_DEPRECATION_WARNING=1'
ensure_line "${HOME}/.bashrc" "${BREW_SHELLENV_LINE}"
ensure_line "${HOME}/.bashrc" "${CODEX_PATH_LINE}"
ensure_line "${HOME}/.bashrc" "${LOCAL_NODE_PATH_LINE}"
ensure_line "${HOME}/.bashrc" 'export PATH="$HOME/.npm-global/bin:$PATH"'
ensure_line "${HOME}/.bashrc" 'export BASH_SILENCE_DEPRECATION_WARNING=1'
ensure_line "${HOME}/.zprofile" "${BREW_SHELLENV_LINE}"
ensure_line "${HOME}/.zprofile" "${CODEX_PATH_LINE}"
ensure_line "${HOME}/.zprofile" "${LOCAL_NODE_PATH_LINE}"
ensure_line "${HOME}/.zprofile" 'export PATH="$HOME/.npm-global/bin:$PATH"'
ensure_line "${HOME}/.zprofile" 'export BASH_SILENCE_DEPRECATION_WARNING=1'
ensure_line "${HOME}/.zshrc" "${CODEX_PATH_LINE}"
ensure_line "${HOME}/.zshrc" "${LOCAL_NODE_PATH_LINE}"
ensure_line "${HOME}/.zshrc" 'export PATH="$HOME/.npm-global/bin:$PATH"'
ensure_line "${HOME}/.zshrc" 'export BASH_SILENCE_DEPRECATION_WARNING=1'

chmod +x \
  "${BIN_DIR}/arcana-shell" \
  "${BIN_DIR}/arcana-studio" \
  "${BIN_DIR}/arcana-share" \
  "${BIN_DIR}/arcana-doctor" \
  "${BIN_DIR}/arcana-imac-shell" \
  "${BIN_DIR}/arcana-imac-studio" \
  "${BIN_DIR}/arcana-imac-share" \
  "${BIN_DIR}/arcana-imac-doctor" \
  "${BIN_DIR}/arcana-imac-bootstrap" \
  "${BIN_DIR}/arcana-imac-codex-sync"
ensure_link "${BIN_DIR}/arcana-shell" "${USER_BIN_DIR}/arcana-shell"
ensure_link "${BIN_DIR}/arcana-studio" "${USER_BIN_DIR}/arcana-studio"
ensure_link "${BIN_DIR}/arcana-share" "${USER_BIN_DIR}/arcana-share"
ensure_link "${BIN_DIR}/arcana-doctor" "${USER_BIN_DIR}/arcana-doctor"
ensure_link "${BIN_DIR}/arcana-imac-shell" "${USER_BIN_DIR}/arcana-imac-shell"
ensure_link "${BIN_DIR}/arcana-imac-studio" "${USER_BIN_DIR}/arcana-imac-studio"
ensure_link "${BIN_DIR}/arcana-imac-share" "${USER_BIN_DIR}/arcana-imac-share"
ensure_link "${BIN_DIR}/arcana-imac-doctor" "${USER_BIN_DIR}/arcana-imac-doctor"
ensure_link "${BIN_DIR}/arcana-imac-bootstrap" "${USER_BIN_DIR}/arcana-imac-bootstrap"
ensure_link "${BIN_DIR}/arcana-imac-codex-sync" "${USER_BIN_DIR}/arcana-imac-codex-sync"

if [[ -d "${BREW_BIN_DIR}" ]]; then
  ensure_link "${BIN_DIR}/arcana-shell" "${BREW_BIN_DIR}/arcana-shell"
  ensure_link "${BIN_DIR}/arcana-studio" "${BREW_BIN_DIR}/arcana-studio"
  ensure_link "${BIN_DIR}/arcana-share" "${BREW_BIN_DIR}/arcana-share"
  ensure_link "${BIN_DIR}/arcana-doctor" "${BREW_BIN_DIR}/arcana-doctor"
  ensure_link "${BIN_DIR}/arcana-imac-shell" "${BREW_BIN_DIR}/arcana-imac-shell"
  ensure_link "${BIN_DIR}/arcana-imac-studio" "${BREW_BIN_DIR}/arcana-imac-studio"
  ensure_link "${BIN_DIR}/arcana-imac-share" "${BREW_BIN_DIR}/arcana-imac-share"
  ensure_link "${BIN_DIR}/arcana-imac-doctor" "${BREW_BIN_DIR}/arcana-imac-doctor"
  ensure_link "${BIN_DIR}/arcana-imac-bootstrap" "${BREW_BIN_DIR}/arcana-imac-bootstrap"
  ensure_link "${BIN_DIR}/arcana-imac-codex-sync" "${BREW_BIN_DIR}/arcana-imac-codex-sync"
fi

if [[ -d "${USR_LOCAL_BIN_DIR}" && -w "${USR_LOCAL_BIN_DIR}" ]]; then
  ensure_link "${BIN_DIR}/arcana-shell" "${USR_LOCAL_BIN_DIR}/arcana-shell"
  ensure_link "${BIN_DIR}/arcana-studio" "${USR_LOCAL_BIN_DIR}/arcana-studio"
  ensure_link "${BIN_DIR}/arcana-share" "${USR_LOCAL_BIN_DIR}/arcana-share"
  ensure_link "${BIN_DIR}/arcana-doctor" "${USR_LOCAL_BIN_DIR}/arcana-doctor"
  ensure_link "${BIN_DIR}/arcana-imac-shell" "${USR_LOCAL_BIN_DIR}/arcana-imac-shell"
  ensure_link "${BIN_DIR}/arcana-imac-studio" "${USR_LOCAL_BIN_DIR}/arcana-imac-studio"
  ensure_link "${BIN_DIR}/arcana-imac-share" "${USR_LOCAL_BIN_DIR}/arcana-imac-share"
  ensure_link "${BIN_DIR}/arcana-imac-doctor" "${USR_LOCAL_BIN_DIR}/arcana-imac-doctor"
  ensure_link "${BIN_DIR}/arcana-imac-bootstrap" "${USR_LOCAL_BIN_DIR}/arcana-imac-bootstrap"
  ensure_link "${BIN_DIR}/arcana-imac-codex-sync" "${USR_LOCAL_BIN_DIR}/arcana-imac-codex-sync"
fi

CODEX_BIN_SOURCE=""
if [[ -x "${SYSTEM_CODEX_BIN}" ]]; then
  CODEX_BIN_SOURCE="${SYSTEM_CODEX_BIN}"
elif [[ -x "${USER_CODEX_BIN}" ]]; then
  CODEX_BIN_SOURCE="${USER_CODEX_BIN}"
fi

if [[ -n "${CODEX_BIN_SOURCE}" ]]; then
  install_codex_link_if_safe "${CODEX_BIN_SOURCE}" "${USER_BIN_DIR}/codex"

  if [[ -d "${BREW_BIN_DIR}" ]]; then
    install_codex_link_if_safe "${CODEX_BIN_SOURCE}" "${BREW_BIN_DIR}/codex"
  fi

  if [[ -d "${USR_LOCAL_BIN_DIR}" && -w "${USR_LOCAL_BIN_DIR}" ]]; then
    install_codex_link_if_safe "${CODEX_BIN_SOURCE}" "${USR_LOCAL_BIN_DIR}/codex"
  fi
fi

for codex_resources_dir in \
  "/Applications/Codex.app/Contents/Resources" \
  "${HOME}/Applications/Codex.app/Contents/Resources"; do
  remove_path_if_present "${codex_resources_dir}/arcana-shell"
  remove_path_if_present "${codex_resources_dir}/arcana-studio"
  remove_path_if_present "${codex_resources_dir}/arcana-share"
  remove_path_if_present "${codex_resources_dir}/arcana-doctor"
  remove_path_if_present "${codex_resources_dir}/arcana-imac-shell"
  remove_path_if_present "${codex_resources_dir}/arcana-imac-studio"
  remove_path_if_present "${codex_resources_dir}/arcana-imac-share"
  remove_path_if_present "${codex_resources_dir}/arcana-imac-doctor"
  remove_path_if_present "${codex_resources_dir}/arcana-imac-bootstrap"
  remove_path_if_present "${codex_resources_dir}/arcana-imac-codex-sync"
done

write_desktop_share_command

printf 'Installed Arcana commands:\n'
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-shell" "${BIN_DIR}/arcana-shell"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-studio" "${BIN_DIR}/arcana-studio"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-share" "${BIN_DIR}/arcana-share"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-doctor" "${BIN_DIR}/arcana-doctor"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-imac-shell" "${BIN_DIR}/arcana-imac-shell"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-imac-studio" "${BIN_DIR}/arcana-imac-studio"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-imac-share" "${BIN_DIR}/arcana-imac-share"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-imac-doctor" "${BIN_DIR}/arcana-imac-doctor"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-imac-bootstrap" "${BIN_DIR}/arcana-imac-bootstrap"
printf '  %s -> %s\n' "${USER_BIN_DIR}/arcana-imac-codex-sync" "${BIN_DIR}/arcana-imac-codex-sync"

if [[ -d "${BREW_BIN_DIR}" ]]; then
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-shell" "${BIN_DIR}/arcana-shell"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-studio" "${BIN_DIR}/arcana-studio"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-share" "${BIN_DIR}/arcana-share"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-doctor" "${BIN_DIR}/arcana-doctor"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-imac-shell" "${BIN_DIR}/arcana-imac-shell"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-imac-studio" "${BIN_DIR}/arcana-imac-studio"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-imac-share" "${BIN_DIR}/arcana-imac-share"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-imac-doctor" "${BIN_DIR}/arcana-imac-doctor"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-imac-bootstrap" "${BIN_DIR}/arcana-imac-bootstrap"
  printf '  %s -> %s\n' "${BREW_BIN_DIR}/arcana-imac-codex-sync" "${BIN_DIR}/arcana-imac-codex-sync"
fi

if [[ -d "${USR_LOCAL_BIN_DIR}" && -w "${USR_LOCAL_BIN_DIR}" ]]; then
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-shell" "${BIN_DIR}/arcana-shell"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-studio" "${BIN_DIR}/arcana-studio"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-share" "${BIN_DIR}/arcana-share"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-doctor" "${BIN_DIR}/arcana-doctor"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-imac-shell" "${BIN_DIR}/arcana-imac-shell"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-imac-studio" "${BIN_DIR}/arcana-imac-studio"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-imac-share" "${BIN_DIR}/arcana-imac-share"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-imac-doctor" "${BIN_DIR}/arcana-imac-doctor"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-imac-bootstrap" "${BIN_DIR}/arcana-imac-bootstrap"
  printf '  %s -> %s\n' "${USR_LOCAL_BIN_DIR}/arcana-imac-codex-sync" "${BIN_DIR}/arcana-imac-codex-sync"
fi

printf '  %s -> arcana-share\n' "${DESKTOP_SHARE_COMMAND}"
