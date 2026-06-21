#!/usr/bin/env bash
# Build the `scrapper` binary and register this folder as its data root so `scrapper` can be run
# from anywhere. Installs to ~/.cargo/bin and writes ~/.config/scrapper/config.json (a pointer to
# this folder, where the real config.json + database + secrets live).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing scrapper from ${ROOT}"
cargo install --path "${ROOT}" --force

CONFIG_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/scrapper"
mkdir -p "${CONFIG_DIR}"
printf '{\n  "root": "%s"\n}\n' "${ROOT}" > "${CONFIG_DIR}/config.json"
echo "==> Wrote ${CONFIG_DIR}/config.json (root → ${ROOT})"

if command -v scrapper >/dev/null 2>&1; then
  echo "==> Installed: $(command -v scrapper)"
  echo "    Try it from anywhere:  scrapper status"
else
  echo "==> Installed to ~/.cargo/bin/scrapper — ensure ~/.cargo/bin is on your PATH"
fi
