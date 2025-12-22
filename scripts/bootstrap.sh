#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if ! command -v proto >/dev/null 2>&1; then
  echo "[bootstrap] proto not found; installing proto..."
  bash <(curl -fsSL https://moonrepo.dev/install/proto.sh) --yes
  export PATH="$HOME/.proto/bin:$HOME/.proto/shims:$PATH"
fi

echo "[bootstrap] Installing pinned toolchain from .prototools..."
proto install

echo "[bootstrap] Toolchain:"
node --version
yarn --version

echo "[bootstrap] Installing dependencies (skipping Playwright browser downloads)..."
yarn install

echo "[bootstrap] Done. Try: yarn build"


