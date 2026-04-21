#!/usr/bin/env bash
set -euo pipefail

CLIENT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ROOT="${SERVER_ROOT:-$HOME/Projects/dj-assist-server}"
SERVER_PORT="${SERVER_PORT:-3001}"
CLIENT_PORT="${CLIENT_PORT:-3000}"
SERVER_URL="http://127.0.0.1:${SERVER_PORT}"
ENV_FILE="${CLIENT_ROOT}/.env.local"

SERVER_PID=""
APP_PID=""

fail() {
  echo "Error: $*" >&2
  exit 1
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
  local attempts="${2:-90}"
  local i
  for ((i = 0; i < attempts; i += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

env_value() {
  local key="$1"
  [ -f "${ENV_FILE}" ] || return 1
  grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2-
}

cleanup() {
  set +e
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" >/dev/null 2>&1; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

[ -d "${CLIENT_ROOT}" ] || fail "Missing client repo: ${CLIENT_ROOT}"
[ -d "${SERVER_ROOT}" ] || fail "Missing server repo: ${SERVER_ROOT}"
[ -d "${CLIENT_ROOT}/.venv" ] || fail "Missing ${CLIENT_ROOT}/.venv. Create it first."
[ -f "${ENV_FILE}" ] || fail "Missing ${ENV_FILE}"

GOOGLE_CLIENT_ID="$(env_value GOOGLE_CLIENT_ID || true)"
[ -n "${GOOGLE_CLIENT_ID}" ] || fail "GOOGLE_CLIENT_ID is missing from ${ENV_FILE}"

load_nvm
nvm use 22 >/dev/null

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

echo "Building packaged mac app"
(
  cd "${CLIENT_ROOT}"
  ./scripts/build-mac-local.sh
)

APP_BUNDLE="$(find "${CLIENT_ROOT}/dist-electron" -type d -name 'DJ Assist.app' | head -n 1)"
[ -n "${APP_BUNDLE}" ] || fail "Could not find built DJ Assist.app under ${CLIENT_ROOT}/dist-electron"
APP_EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/DJ Assist"
[ -x "${APP_EXECUTABLE}" ] || fail "Built app executable not found at ${APP_EXECUTABLE}"

echo "Launching built app from ${APP_EXECUTABLE}"
(
  cd "${CLIENT_ROOT}"
  export GOOGLE_CLIENT_ID
  export DJ_ASSIST_LOCAL_SERVER_URL="${SERVER_URL}"
  export DJ_ASSIST_ELECTRON_PORT="${CLIENT_PORT}"
  "${APP_EXECUTABLE}"
) &
APP_PID=$!

wait "${APP_PID}"
