#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_BASE="${HOME}/.local/python-build-standalone"
PYTHON_RELEASE_TAG="${PYTHON_RELEASE_TAG:-20260408}"
PYTHON_ARCHIVE_NAME="${PYTHON_ARCHIVE_NAME:-cpython-3.11.15+20260408-aarch64-apple-darwin-install_only_stripped.tar.gz}"
PYTHON_DOWNLOAD_URL="${PYTHON_DOWNLOAD_URL:-https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE_TAG}/${PYTHON_ARCHIVE_NAME}}"
BUILD_MODE="${1:-pack}"

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

load_nvm() {
  if command -v nvm >/dev/null 2>&1; then
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "${NVM_DIR}/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "${NVM_DIR}/nvm.sh"
    return
  fi

  fail "nvm is not available. Install nvm or load it before running this script."
}

resolve_python_root() {
  if [ -x "${STANDALONE_BASE}/python/bin/python3" ] || [ -x "${STANDALONE_BASE}/python/bin/python" ]; then
    printf '%s\n' "${STANDALONE_BASE}/python"
    return
  fi

  find "${STANDALONE_BASE}" -type f \( -name python3 -o -name python \) \
    -path "*/bin/*" \
    | head -n 1 \
    | xargs -I{} dirname "{}" \
    | xargs -I{} dirname "{}"
}

download_standalone_python() {
  mkdir -p "${STANDALONE_BASE}"
  cd "${STANDALONE_BASE}"

  if [ ! -f "${PYTHON_ARCHIVE_NAME}" ]; then
    echo "Downloading standalone Python runtime..."
    curl -fL -o "${PYTHON_ARCHIVE_NAME}" "${PYTHON_DOWNLOAD_URL}"
  else
    echo "Using existing archive ${STANDALONE_BASE}/${PYTHON_ARCHIVE_NAME}"
  fi

  echo "Extracting standalone Python runtime..."
  tar -xzf "${PYTHON_ARCHIVE_NAME}"
}

main() {
  case "${BUILD_MODE}" in
    pack|dist)
      ;;
    *)
      fail "Usage: scripts/build-mac-local.sh [pack|dist]"
      ;;
  esac

  require_command curl
  require_command tar
  require_command find

  download_standalone_python

  DJ_ASSIST_PYTHON_STANDALONE="$(resolve_python_root)"
  [ -n "${DJ_ASSIST_PYTHON_STANDALONE}" ] || fail "Could not locate extracted standalone Python runtime."
  [ -x "${DJ_ASSIST_PYTHON_STANDALONE}/bin/python3" ] || [ -x "${DJ_ASSIST_PYTHON_STANDALONE}/bin/python" ] \
    || fail "Extracted runtime does not contain bin/python3 or bin/python."

  export DJ_ASSIST_PYTHON_STANDALONE

  cd "${ROOT_DIR}"
  [ -d ".venv" ] || fail "Missing .venv. Create it first with python3 -m venv .venv."
  # shellcheck source=/dev/null
  . ".venv/bin/activate"

  load_nvm
  nvm use 22 >/dev/null

  echo "Using standalone Python root: ${DJ_ASSIST_PYTHON_STANDALONE}"
  echo "Using Node version: $(node -v)"

  if [ "${BUILD_MODE}" = "dist" ]; then
    npm run dist:mac
  else
    npm run pack:mac
  fi
}

main "$@"
