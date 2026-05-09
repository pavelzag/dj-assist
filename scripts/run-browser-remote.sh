#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

rm -rf .next
npm ci
DJ_ASSIST_SERVER_ENABLED=true DJ_ASSIST_SERVER_URL=https://dj-assist-server.vercel.app npm run backend:dev
