#!/usr/bin/env bash
# Run dfx with the Motoko compiler pinned in mops.toml ([toolchain] moc).
# dfx 0.31 ships moc 1.1.x, which cannot compile mo:core >= 2.4.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v mops >/dev/null 2>&1; then
  echo "mops is required. Install: npm i -g ic-mops" >&2
  exit 1
fi

if [[ ! -f "$ROOT/mops.toml" ]]; then
  echo "mops.toml not found in $ROOT" >&2
  exit 1
fi

# Ensure the pinned moc is installed and moc-wrapper is available.
mops install >/dev/null
mops toolchain use moc >/dev/null 2>&1 || true

export DFX_MOC_PATH="${DFX_MOC_PATH:-moc-wrapper}"

if ! command -v "$DFX_MOC_PATH" >/dev/null 2>&1 && [[ "$DFX_MOC_PATH" == "moc-wrapper" ]]; then
  echo "moc-wrapper not on PATH. Run once: mops toolchain init" >&2
  echo "Then open a new shell (or: export DFX_MOC_PATH=moc-wrapper)" >&2
  exit 1
fi

exec dfx "$@"
