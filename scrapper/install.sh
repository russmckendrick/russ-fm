#!/usr/bin/env bash
# Build the `scrapper` binary and register this folder as its data root so `scrapper` can be run
# from anywhere. Installs to ~/.cargo/bin and writes ~/.config/scrapper/config.json (a pointer to
# this folder, where the real config.json + database + secrets live).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing scrapper from ${ROOT}"

# The web UI (bare `scrapper`) is a Vite app embedded into the binary at compile time, so it
# must be built first. Without pnpm the binary still installs; the browser shows how to build it.
if command -v pnpm >/dev/null 2>&1; then
  echo "==> Building the web UI (web/)"
  pnpm --dir "${ROOT}/web" install --frozen-lockfile
  pnpm --dir "${ROOT}/web" build
else
  echo "==> pnpm not found — skipping the web UI build (the CLI and \`scrapper --tui\` still work)"
fi

cargo install --path "${ROOT}" --force

CONFIG_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/scrapper"
mkdir -p "${CONFIG_DIR}"
printf '{\n  "root": "%s"\n}\n' "${ROOT}" > "${CONFIG_DIR}/config.json"
echo "==> Wrote ${CONFIG_DIR}/config.json (root → ${ROOT})"

if command -v scrapper >/dev/null 2>&1; then
  echo "==> Installed: $(command -v scrapper)"
  echo "    Try it from anywhere:  scrapper  (web UI) · scrapper --tui · scrapper status"
else
  echo "==> Installed to ~/.cargo/bin/scrapper — ensure ~/.cargo/bin is on your PATH"
fi
