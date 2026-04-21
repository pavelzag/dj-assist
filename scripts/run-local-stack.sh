#!/usr/bin/env bash
set -euo pipefail

CLIENT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ROOT="${SERVER_ROOT:-$HOME/Projects/dj-assist-server}"
CLIENT_PORT="${CLIENT_PORT:-3000}"
SERVER_PORT="${SERVER_PORT:-3001}"
SERVER_URL="http://127.0.0.1:${SERVER_PORT}"

SERVER_PID=""
CLIENT_PID=""

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_dir() {
  [ -d "$1" ] || fail "Missing directory: $1"
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

  fail "nvm is not available. Install or load nvm first."
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-60}"
  local i
  for ((i = 0; i < attempts; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup() {
  set +e
  if [ -n "${CLIENT_PID}" ] && kill -0 "${CLIENT_PID}" >/dev/null 2>&1; then
    kill "${CLIENT_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

require_dir "${CLIENT_ROOT}"
require_dir "${SERVER_ROOT}"
[ -d "${CLIENT_ROOT}/.venv" ] || fail "Missing ${CLIENT_ROOT}/.venv. Create it first."
[ -f "${CLIENT_ROOT}/package.json" ] || fail "Missing client package.json in ${CLIENT_ROOT}"
[ -f "${SERVER_ROOT}/package.json" ] || fail "Missing server package.json in ${SERVER_ROOT}"

load_nvm
nvm use 22 >/dev/null

pkill -f "next.*${CLIENT_PORT}" >/dev/null 2>&1 || true
pkill -f "next.*${SERVER_PORT}" >/dev/null 2>&1 || true
pkill -f "electron/main.cjs" >/dev/null 2>&1 || true
pkill -f "DJ Assist" >/dev/null 2>&1 || true

echo "Starting dj-assist-server on ${SERVER_URL}"
(
  cd "${SERVER_ROOT}"
  npm run dev:local
) &
SERVER_PID=$!

wait_for_http "${SERVER_URL}/api/health" 90 || fail "Server did not become ready on ${SERVER_URL}"
echo "Server ready: ${SERVER_URL}"

echo "Starting dj-assist client on http://127.0.0.1:${CLIENT_PORT}"
(
  cd "${CLIENT_ROOT}"
  # shellcheck source=/dev/null
  . ".venv/bin/activate"
  export DJ_ASSIST_ELECTRON_PORT="${CLIENT_PORT}"
  export DJ_ASSIST_LOCAL_SERVER_URL="${SERVER_URL}"
  npm run dev
) &
CLIENT_PID=$!

wait "${CLIENT_PID}"
